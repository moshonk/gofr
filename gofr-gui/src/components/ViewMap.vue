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
    FhirMap,
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