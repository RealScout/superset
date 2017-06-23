/* eslint-disable no-param-reassign */
import d3 from 'd3';
import React from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import MapGL from 'react-map-gl';
import ScatterPlotOverlay from 'react-map-gl/dist/overlays/scatterplot.react';
import Immutable from 'immutable';
import supercluster from 'supercluster';
import ViewportMercator from 'viewport-mercator-project';
import {
		kmToPixels,
		rgbLuminance,
		isNumeric,
		MILES_PER_KM,
		DEFAULT_LONGITUDE,
		DEFAULT_LATITUDE,
		DEFAULT_ZOOM,
} from '../utils/common';

var rewind = require('./geojson-rewind');
require('./mapbox.css');

const mapStyle = {
	"version": 8,
	"name": "Basic",
	"metadata": {
		"mapbox:autocomposite": true
	},
	"sources": {
		"mapbox": {
			"url": "mapbox://mapbox.mapbox-streets-v7",
			"type": "vector"
		}
	},
	"sprite": "mapbox://sprites/mapbox/basic-v8",
	"glyphs": "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
	"layers": [
		{
			"id": "background",
			"type": "background",
			"paint": {
				"background-color": "#dedede"
			},
			"interactive": true
		},
	]
};

function buildStyle({fill = 'red', stroke = 'blue', data={}, opacity=1.0}) {
	let im_data = Immutable.Map(data);
	im_data = im_data
			.set('features', im_data.get('features').map(function (feature) {
				//feature['geometry']['coordinates'][0][0].reverse();
				return feature;
			}));

	//console.log('data', JSON.stringify(data));
	let result = Immutable.fromJS({
		version: 8,
		name: 'Example raster tile source',
		sources: {
			'my-geojson-polygon-source': {
				type: 'geojson',
				data: im_data
			}
		},
		layers: [
			{
				id: 'geojson-polygon-fill',
				source: 'my-geojson-polygon-source',
				type: 'fill',
				paint: {'fill-color': fill, 'fill-opacity': opacity},
				interactive: true
			},
			{
				id: 'geojson-polygon-stroke',
				source: 'my-geojson-polygon-source',
				type: 'line',
				paint: {'line-color': stroke, 'line-width': 4, 'line-opacity': opacity},
				interactive: false
			},
			{
				id: 'geojson-polygon-point',
				source: 'my-geojson-polygon-source',
				type: 'circle',
				paint: {'circle-radius': 5, 'circle-color': fill, 'circle-opacity': opacity},
				interactive: false
			},
			{
				id: 'geojson-polygon-label',
				source: 'my-geojson-polygon-source',
				type: 'symbol',
				"layout": {
					"text-field": "{label}",
					"text-font": [
						"DIN Offc Pro Medium",
						"Arial Unicode MS Bold"
					],
					"text-anchor": "top",
					"text-offset": [0,1.5],
					"text-size": 12
				}
			}
		]
	});
	//console.log(JSON.stringify(result.getIn(['sources', 'my-geojson-polygon-source', 'data']).toJS()));
	return result;
}


class MapboxViz extends React.Component {
	constructor(props) {
		super(props);

		const longitude = this.props.viewportLongitude || DEFAULT_LONGITUDE;
		const latitude = this.props.viewportLatitude || DEFAULT_LATITUDE;

		var MapboxClient = require('mapbox');
		var client = new MapboxClient(this.props.mapboxApiKey);

		console.log(this.props.rgb);
		client.readStyle(this.props.mapStyle.split('/').pop(), 'mapbox')
				.then((response) => {
					let style = Immutable.fromJS(response.entity);

					let builtStyle = buildStyle({
						data: this.props.geoJSON,
						stroke: 'black',
						fill: this.props.rgb[0],
						opacity: this.props.globalOpacity
					});
					let layers = style.get('layers').filter(layer => layer.get('type', '') !== 'fill-extrusion').concat(builtStyle.get('layers'));
					let source = builtStyle.getIn(['sources', 'my-geojson-polygon-source']);

					let newStyle = style
							.set('layers', layers)
							.setIn(['sources', 'my-geojson-polygon-source'], source);
					this.setState({
						mapStyle: newStyle
					})
				})
				.catch(function (err) {
					console.error(err);
				});
		this.state = {
			mapStyle: Immutable.fromJS(mapStyle),
			viewport: {
				longitude,
				latitude,
				zoom: this.props.viewportZoom || DEFAULT_ZOOM,
				startDragLngLat: [longitude, latitude],
			},
		};
		this.onChangeViewport = this.onChangeViewport.bind(this);
	}

	onChangeViewport(viewport) {
		this.setState({
			viewport,
		});
	}

	render() {
		const mercator = ViewportMercator({
			width: this.props.sliceWidth,
			height: this.props.sliceHeight,
			longitude: this.state.viewport.longitude,
			latitude: this.state.viewport.latitude,
			zoom: this.state.viewport.zoom,
		});
		const topLeft = mercator.unproject([0, 0]);
		const bottomRight = mercator.unproject([this.props.sliceWidth, this.props.sliceHeight]);
		const bbox = [topLeft[0], bottomRight[1], bottomRight[0], topLeft[1]];
		//const clusters = this.props.clusterer.getClusters(bbox, Math.round(this.state.viewport.zoom));
		const isDragging = this.state.viewport.isDragging === undefined ? false :
				this.state.viewport.isDragging;

		d3.select('#viewport_longitude').attr('value', this.state.viewport.longitude);
		d3.select('#viewport_latitude').attr('value', this.state.viewport.latitude);
		d3.select('#viewport_zoom').attr('value', this.state.viewport.zoom);
		return (
				<MapGL
						{...this.state.viewport}
						mapStyle={this.state.mapStyle}
						width={this.props.sliceWidth}
						height={this.props.sliceHeight}
						mapboxApiAccessToken={this.props.mapboxApiKey}
						onChangeViewport={this.onChangeViewport}
				/>
		);
	}
}

MapboxViz.propTypes = {
	aggregatorName: PropTypes.string,
	clusterer: PropTypes.object,
	globalOpacity: PropTypes.number,
	mapStyle: PropTypes.string,
	mapboxApiKey: PropTypes.string,
	pointRadius: PropTypes.number,
	pointRadiusUnit: PropTypes.string,
	renderWhileDragging: PropTypes.bool,
	rgb: PropTypes.array,
	sliceHeight: PropTypes.number,
	sliceWidth: PropTypes.number,
	viewportLatitude: PropTypes.number,
	viewportLongitude: PropTypes.number,
	viewportZoom: PropTypes.number,
};

function mapbox(slice, json) {
	const div = d3.select(slice.selector);
	const DEFAULT_POINT_RADIUS = 60;
	const DEFAULT_MAX_ZOOM = 16;

	// Validate mapbox color
	const rgb = /^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/.exec(json.data.color);
	if (rgb === null) {
		slice.error('Color field must be of form \'rgb(%d, %d, %d)\'');
		return;
	}

	div.selectAll('*').remove();
	ReactDOM.render(
			<MapboxViz
					{...json.data}
					rgb={rgb}
					sliceHeight={slice.height()}
					sliceWidth={slice.width()}
					pointRadius={DEFAULT_POINT_RADIUS}
			/>,
			div.node(),
	);
}

module.exports = mapbox;
