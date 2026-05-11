#!/usr/bin/env python3
"""
Generate FHIR StructureDefinition snapshots for fshcustom resources.
SUSHI FSHOnly mode doesn't generate snapshots, so we do it here by
applying differentials on top of base definition snapshots.
"""

import json
import glob
import copy
import os
import re
import sys

R4_PACKAGE = os.path.expanduser("~/.fhir/packages/hl7.fhir.r4.core#4.0.1/package")
FSHCUSTOM_RESOURCES = os.path.join(os.path.dirname(__file__), "fsh-generated/resources")

# Map of type-specific path suffixes to their [x] base type code
# e.g. "valueCode" -> ("value[x]", "code"), "valueCodeableConcept" -> ("value[x]", "CodeableConcept")
FHIR_TYPES = [
    "base64Binary", "boolean", "canonical", "code", "date", "dateTime",
    "decimal", "id", "instant", "integer", "markdown", "oid", "positiveInt",
    "string", "time", "unsignedInt", "uri", "url", "uuid",
    "Address", "Age", "Annotation", "Attachment", "CodeableConcept", "Coding",
    "ContactPoint", "Count", "Distance", "Duration", "HumanName", "Identifier",
    "Money", "Period", "Quantity", "Range", "Ratio", "Reference",
    "SampledData", "Signature", "Timing", "ContactDetail", "Contributor",
    "DataRequirement", "Expression", "ParameterDefinition", "RelatedArtifact",
    "TriggerDefinition", "UsageContext", "Dosage", "Meta",
]


def get_choice_type_info(path_segment):
    """Check if a path segment is a type-narrowed choice (e.g. 'valueCode').
    Returns (base_segment, type_code) or None."""
    for fhir_type in FHIR_TYPES:
        # Check common prefixes: value, onset, deceased, effective, etc.
        for prefix in ["value", "onset", "deceased", "effective", "multipleBirth",
                       "abatement", "defaultValue", "fixed", "pattern",
                       "example", "minValue", "maxValue"]:
            if path_segment == prefix + fhir_type[0].upper() + fhir_type[1:]:
                return (prefix + "[x]", fhir_type)
            if path_segment == prefix + fhir_type:
                return (prefix + "[x]", fhir_type)
    return None


def load_base_r4_sds():
    """Load all R4 base StructureDefinitions into a url-keyed dict."""
    sds = {}
    for f in glob.glob(os.path.join(R4_PACKAGE, "StructureDefinition-*.json")):
        with open(f) as fh:
            sd = json.load(fh)
        if "url" in sd:
            sds[sd["url"]] = sd
    print(f"Loaded {len(sds)} base R4 StructureDefinitions")
    return sds


def load_fshcustom_sds():
    """Load all fshcustom StructureDefinitions into a url-keyed dict."""
    sds = {}
    files = {}
    for f in glob.glob(os.path.join(FSHCUSTOM_RESOURCES, "StructureDefinition-*.json")):
        with open(f) as fh:
            sd = json.load(fh)
        if "url" in sd:
            sds[sd["url"]] = sd
            files[sd["url"]] = f
    print(f"Loaded {len(sds)} fshcustom StructureDefinitions")
    return sds, files


def topological_sort(sds):
    """Sort SDs so that base definitions come before derived ones."""
    sorted_urls = []
    visited = set()
    in_progress = set()

    def visit(url):
        if url in visited:
            return
        if url in in_progress:
            return  # cycle, skip
        if url not in sds:
            return  # external dependency
        in_progress.add(url)
        base = sds[url].get("baseDefinition", "")
        if base and base in sds:
            visit(base)
        in_progress.discard(url)
        visited.add(url)
        sorted_urls.append(url)

    for url in sds:
        visit(url)
    return sorted_urls


def merge_element(base_el, diff_el):
    """Merge a differential element into a base snapshot element."""
    merged = copy.deepcopy(base_el)
    for key, value in diff_el.items():
        if key == "id":
            merged["id"] = value
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def find_insert_index(snapshot_elements, path):
    """Find where to insert a new element based on its path."""
    parent_path = ".".join(path.split(".")[:-1]) if "." in path else path
    last_idx = 0
    for i, el in enumerate(snapshot_elements):
        el_path = el.get("path", "")
        if el_path == parent_path or el_path.startswith(parent_path + "."):
            last_idx = i + 1
    return last_idx


def rebuild_indexes(snapshot_elements):
    """Rebuild id and path indexes for snapshot elements."""
    snap_by_id = {}
    snap_by_path = {}
    for i, el in enumerate(snapshot_elements):
        el_id = el.get("id", el.get("path", ""))
        snap_by_id[el_id] = i
        path = el.get("path", "")
        if path not in snap_by_path:
            snap_by_path[path] = []
        snap_by_path[path].append(i)
    return snap_by_id, snap_by_path


def find_base_element_for_path(snapshot_elements, snap_by_path, diff_path):
    """Find the base element for a differential path, handling [x] type narrowing.

    For example, if diff_path is 'Extension.valueCode', we look for:
    1. 'Extension.valueCode' directly
    2. 'Extension.value[x]' (the polymorphic base)

    Returns (base_element, resolved_type_code) or (None, None).
    """
    # Direct match
    if diff_path in snap_by_path:
        idx = snap_by_path[diff_path][0]
        return snapshot_elements[idx], None

    # Try [x] resolution on the last path segment
    parts = diff_path.rsplit(".", 1)
    if len(parts) == 2:
        parent_path, last_seg = parts
        choice_info = get_choice_type_info(last_seg)
        if choice_info:
            base_seg, type_code = choice_info
            base_path = f"{parent_path}.{base_seg}"
            if base_path in snap_by_path:
                idx = snap_by_path[base_path][0]
                return snapshot_elements[idx], type_code

    return None, None


def resolve_type_element(all_sds, parent_type_code, child_name):
    """Look up a child element within a FHIR complex type's StructureDefinition.

    For example, resolve_type_element(all_sds, 'HumanName', 'family')
    returns the snapshot element for HumanName.family from the R4 base.
    """
    type_url = f"http://hl7.org/fhir/StructureDefinition/{parent_type_code}"
    type_sd = all_sds.get(type_url)
    if not type_sd or "snapshot" not in type_sd:
        return None
    target_path = f"{parent_type_code}.{child_name}"
    for el in type_sd["snapshot"]["element"]:
        if el.get("path") == target_path:
            return copy.deepcopy(el)
    return None


def find_parent_type(snapshot_elements, snap_by_path, snap_by_id, diff_path, diff_id):
    """Find the FHIR type code of the parent element.

    For 'Organization.contact.name.family', find the type of 'Organization.contact.name'.
    Also handles sliced paths like 'Extension.extension:foo.valueString'.
    """
    if "." not in diff_path:
        return None, None

    parent_path = diff_path.rsplit(".", 1)[0]
    child_name = diff_path.rsplit(".", 1)[1]

    # Also try the sliced parent ID
    parent_id = diff_id.rsplit(".", 1)[0] if "." in diff_id else diff_id

    # Try finding parent by id first
    if parent_id in snap_by_id:
        parent_el = snapshot_elements[snap_by_id[parent_id]]
        if parent_el.get("type") and parent_el["type"][0].get("code"):
            return parent_el["type"][0]["code"], child_name

    # Try finding parent by path
    if parent_path in snap_by_path:
        parent_el = snapshot_elements[snap_by_path[parent_path][0]]
        if parent_el.get("type") and parent_el["type"][0].get("code"):
            return parent_el["type"][0]["code"], child_name

    return None, None


def make_base_property(path, min_val=0, max_val="*"):
    """Create a 'base' property for an element."""
    return {
        "path": path,
        "min": min_val,
        "max": str(max_val),
    }


def narrow_type_for_choice(base_el, type_code):
    """Given a base element with multiple types (e.g. value[x]) and a specific
    type code, return a narrowed type list with just that type."""
    if not base_el.get("type"):
        return [{"code": type_code}]

    for t in base_el["type"]:
        if t["code"] == type_code:
            return [copy.deepcopy(t)]

    # Type not found in list, create a simple one
    return [{"code": type_code}]


def generate_snapshot(sd, all_sds):
    """Generate a snapshot for a StructureDefinition by applying its differential
    on top of the base definition's snapshot."""
    base_url = sd.get("baseDefinition", "")
    if not base_url:
        print(f"  WARNING: {sd['id']} has no baseDefinition, skipping")
        return None

    base_sd = all_sds.get(base_url)
    if not base_sd:
        print(f"  WARNING: {sd['id']} base {base_url} not found, skipping")
        return None

    if "snapshot" not in base_sd or not base_sd["snapshot"].get("element"):
        print(f"  WARNING: {sd['id']} base {base_url} has no snapshot, skipping")
        return None

    differential = sd.get("differential", {}).get("element", [])
    if not differential:
        return copy.deepcopy(base_sd["snapshot"])

    # Start with a copy of the base snapshot
    snapshot_elements = copy.deepcopy(base_sd["snapshot"]["element"])
    snap_by_id, snap_by_path = rebuild_indexes(snapshot_elements)

    for diff_el in differential:
        diff_path = diff_el.get("path", "")
        diff_id = diff_el.get("id", diff_path)

        matched = False

        # Check if there is a snapshot element with same id
        if diff_id in snap_by_id:
            idx = snap_by_id[diff_id]
            snapshot_elements[idx] = merge_element(snapshot_elements[idx], diff_el)
            matched = True
        else:
            # Try matching by path (for non-sliced elements)
            if diff_path in snap_by_path and ":" not in diff_id:
                idx = snap_by_path[diff_path][0]
                snapshot_elements[idx] = merge_element(snapshot_elements[idx], diff_el)
                matched = True

        if not matched:
            # New element — build from diff + base info
            new_el = copy.deepcopy(diff_el)

            # Find the base element (handles [x] type narrowing)
            base_el, resolved_type = find_base_element_for_path(
                snapshot_elements, snap_by_path, diff_path
            )

            if base_el:
                # Copy all properties from base that aren't in the diff
                for key in base_el:
                    if key not in new_el and key != "id":
                        new_el[key] = copy.deepcopy(base_el[key])

                # For [x] type narrowing, fix the type list
                if resolved_type:
                    new_el["type"] = narrow_type_for_choice(base_el, resolved_type)

                # Ensure 'base' property exists, pointing to the original base path
                if "base" not in new_el:
                    base_path = base_el.get("path", diff_path)
                    base_min = base_el.get("base", {}).get("min", base_el.get("min", 0))
                    base_max = base_el.get("base", {}).get("max", base_el.get("max", "*"))
                    new_el["base"] = make_base_property(base_path, base_min, base_max)
            else:
                # No direct base found — try resolving via parent type's StructureDefinition
                parent_type, child_name = find_parent_type(
                    snapshot_elements, snap_by_path, snap_by_id, diff_path, diff_id
                )
                if parent_type and child_name:
                    type_el = resolve_type_element(all_sds, parent_type, child_name)
                    if type_el:
                        for key in type_el:
                            if key not in new_el and key != "id":
                                new_el[key] = copy.deepcopy(type_el[key])
                        # Fix the path to match the current context
                        new_el["path"] = diff_path
                        if "base" not in new_el:
                            new_el["base"] = make_base_property(
                                type_el.get("path", diff_path),
                                type_el.get("min", 0), type_el.get("max", "*")
                            )

                # Still ensure minimum required properties
                if "base" not in new_el:
                    new_el["base"] = make_base_property(
                        diff_path, new_el.get("min", 0), new_el.get("max", "*")
                    )
                if "type" not in new_el:
                    # Try to infer type from the path suffix
                    parts = diff_path.rsplit(".", 1)
                    if len(parts) == 2:
                        choice_info = get_choice_type_info(parts[1])
                        if choice_info:
                            new_el["type"] = [{"code": choice_info[1]}]

            # Insert after the parent/base element
            insert_idx = find_insert_index(snapshot_elements, diff_path)
            snapshot_elements.insert(insert_idx, new_el)
            snap_by_id, snap_by_path = rebuild_indexes(snapshot_elements)

    # Final pass: ensure every element has 'base' and 'type' if possible
    for el in snapshot_elements:
        if "base" not in el:
            el["base"] = make_base_property(
                el.get("path", ""), el.get("min", 0), el.get("max", "*")
            )

    return {"element": snapshot_elements}


def main():
    # Load all SDs
    r4_sds = load_base_r4_sds()
    custom_sds, custom_files = load_fshcustom_sds()

    # Combine into one lookup (R4 base + custom)
    all_sds = {}
    all_sds.update(r4_sds)
    all_sds.update(custom_sds)

    # Sort custom SDs in dependency order
    sorted_urls = topological_sort(custom_sds)
    print(f"\nProcessing {len(sorted_urls)} StructureDefinitions in dependency order...\n")

    success = 0
    failed = 0
    for url in sorted_urls:
        sd = custom_sds[url]
        print(f"Processing: {sd['id']}")

        snapshot = generate_snapshot(sd, all_sds)
        if snapshot:
            sd["snapshot"] = snapshot
            # Update in all_sds so derived profiles can use this snapshot
            all_sds[url] = sd
            custom_sds[url] = sd

            # Write back to file
            filepath = custom_files[url]
            with open(filepath, "w") as fh:
                json.dump(sd, fh, indent=2)
            elem_count = len(snapshot.get("element", []))
            print(f"  -> Generated snapshot with {elem_count} elements")
            success += 1
        else:
            failed += 1

    print(f"\nDone: {success} snapshots generated, {failed} skipped")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
