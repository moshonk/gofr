<template>
<v-container grid-list-xs>
  <FhirMap
    :accessToken="accessToken"
    :fhirServerUrl="fhirServerUrl"
    :options="options"
  />
</v-container>
</template>

<script>
import FhirMap from "@terraframe/fhir-gis-widget/src/components/FhirMap.vue";

const GEOJSON_GEOMETRY_TYPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

const normalizeGeoJsonGeometry = (geoJson) => {
  if (!geoJson || typeof geoJson !== "object") {
    return null;
  }

  if (GEOJSON_GEOMETRY_TYPES.has(geoJson.type)) {
    return geoJson;
  }

  if (geoJson.type === "Feature") {
    return normalizeGeoJsonGeometry(geoJson.geometry);
  }

  if (geoJson.type === "FeatureCollection" && Array.isArray(geoJson.features)) {
    const geometries = geoJson.features
      .map((feature) => normalizeGeoJsonGeometry(feature && feature.geometry))
      .filter((geometry) => geometry != null);

    if (geometries.length === 0) {
      return null;
    }

    if (geometries.length === 1) {
      return geometries[0];
    }

    return {
      type: "GeometryCollection",
      geometries,
    };
  }

  return null;
};

const GofrFhirMap = {
  extends: FhirMap,
  methods: {
    ...FhirMap.methods,
    parseGeoJson(resource) {
      const parsedGeometry = FhirMap.methods.parseGeoJson.call(this, resource);
      const normalizedGeometry = normalizeGeoJsonGeometry(parsedGeometry);

      return normalizedGeometry || parsedGeometry;
    },
  },
};

export default {
  name: "App",
  data: () => ({
    accessToken: 'pk.eyJ1IjoiYWxseXNoYWJhbjUiLCJhIjoiY2twbzFpODRtMDFkMTJwbWFvNXUza3hodCJ9.mhcv_KlLLtvR0x73E90WAw',
    options: {
      "center": [
        104.9910,
        12.5657
      ],
      "zoom": 7,
      "isFacility" : true,
      "searchOnLoad" : true,
      "hierarchyExtension": {
        "parameter": "ihe-mcsd-hierarchy-partof"
      },
      "root": "d03c5c0b-a9a0-5066-a122-03f5dc76803e",
      "includeRoot": false,
      "contextServices": [],
      "searchParameters": [
        {
          "key": "physicalType",
          "system": false,
          "label": "Physical Type",
          "placeholder": "Physical Type..",
          "options": []
        }
      ],
      "filters": [],
      "attributes": [
        {
          "name": "identifier",
          "label": "Identifiers",
          "expression": "Location.identifier.value"
        },
        {
          "name": "description",
          "label": "Description",
          "expression": "Location.description.single()"
        },
        {
          "name": "status",
          "label": "Status",
          "expression": "Location.status.single()"
        }
      ],
      "locationStyles": {
        "fill": {
          "fill-color": "#B22222",
          "fill-opacity": 0.8,
          "fill-outline-color": "black"
        }
      },
      "selectedStyles": {
        "circle": {
          "circle-radius": 10,
          "circle-color": "#d3d3d3",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#FFFFFF"
        },
      }
    }
  }),

  components: {
    FhirMap: GofrFhirMap,
  },
  computed: {
    fhirServerUrl() {
      return '/fhir/' + this.$store.state.config.userConfig.FRDatasource
    }
  }
};
</script>

<style>
@import "~mapbox-gl/dist/mapbox-gl.css";
@import "~@terraframe/fhir-gis-widget/dist/fhir-gis-widget.css";

html {
  overflow: hidden;
}

.map-view-port {
  width: 100%;
  height: calc(100vh - 24px);
}
</style>