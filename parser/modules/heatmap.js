var fs = require('fs');
var Canvas = require('canvas');

var width  = 2048;
var height = width/4*3;

var radius = width/5;

var xCenter = 7.8;
var yCenter = 46.8;
var zoom = 0.25*width;

var stretch = 1/Math.cos(Math.PI*yCenter/180);

var projection = new mercatorProjection();

exports.generateHeatmap = function (positions, file) {
	console.log('Generate Heatmap');

	var canvas = new Canvas(width, height);
	var ctx = canvas.getContext('2d');
	var image = ctx.getImageData(0, 0, width, height);
	var buffer2 = new Buffer(width*height*2);

	var a = [];
	for (var yi = 0; yi < height; yi++) {
		a[yi] = [];
		for (var xi = 0; xi < width; xi++) {
			a[yi][xi] = 0;
		}
	}

	var projectX = projection.toPixelX;
	var projectY = projection.toPixelY;

	var geoCoordX = []; for (var x = 0; x <  width; x++) geoCoordX[x] = projection.toGeoX(x);
	var geoCoordY = []; for (var y = 0; y < height; y++) geoCoordY[y] = projection.toGeoY(y);

	var f = 40074000/360;
	var f2 = sqr(f);

	positions.forEach(function (position, index) {
		if (index % 1000 == 0) console.log(Math.round(100*index/positions.length) + ' %');

		var geoRadius = radius/zoom;
		var bias = 1/(f2*sqr(geoRadius) + 10);
		bias = sqr(bias)*4;

		var xp = projectX(position.x);
		var yp = projectY(position.y);

		var x0 = Math.max(       0, Math.floor(xp - radius));
		var x1 = Math.min( width-1, Math.ceil( xp + radius));
		var y0 = Math.max(       0, Math.floor(yp - radius));
		var y1 = Math.min(height-1, Math.ceil( yp + radius));

		for (var yi = y0; yi <= y1; yi++) {
			var y = geoCoordY[yi];
			for (var xi = x0; xi <= x1; xi++) {
				var x = geoCoordX[xi];

				var dx = (position.x - x)/stretch;
				var dy = (position.y - y);
				var value = dx*dx + dy*dy;

				value = value*f2;
				value = 1/(value + sqr(position.r) + 10);
				value = sqr(value);
				value -= bias;
				if (value < 0) value = 0;

				a[yi][xi] += value;
			}
		}
	})


	for (var yi = 0; yi < height; yi++) {
		for (var xi = 0; xi < width; xi++) {

			var value = a[yi][xi]*1e9;
			value = Math.pow(value, 0.2);
			var c1 = value*  255; if (c1 >   255) c1 =   255; if (c1 < 0) c1 = 0; c1 = Math.round(c1);
			var c2 = value*65535; if (c2 > 65535) c2 = 65535; if (c2 < 0) c2 = 0; c2 = Math.round(c2);

			var index = (yi*width + xi);

			buffer2.writeUInt16BE(c2, index*2);

			image.data[index*4+0] = c1;
			image.data[index*4+1] = c1;
			image.data[index*4+2] = c1;
			image.data[index*4+3] = 255;
		}
	}

	ctx.putImageData(image, 0, 0);
	fs.writeFileSync(file+'.png', canvas.toBuffer());
	fs.writeFileSync(file+'.raw', buffer2);
}

exports.generateInkmap = function (positions, file) {
	console.log('Generate Inkmap');

	var canvas = new Canvas(width, height);
	var ctx = canvas.getContext('2d');

	ctx.fillStyle = '#FFF';
	ctx.fillRect(0,0,width,height);

	var projectX = projection.toPixelX;
	var projectY = projection.toPixelY;

	var sorted = positions.map(function (position) { return position });
	sorted.sort(function (a,b) { return b.r - a.r });

	colors = [
		[ 255, 255, 255, 0.00 ],
		[ 255, 255,   0, 0.10 ],
		[ 255,   0,   0, 0.20 ],
		[   0,   0,   0, 1.00 ]
	]

	sorted.forEach(function (position, index) {
		if (index % 1000 == 0) console.log(Math.round(100*index/positions.length) + ' %');

		//0.3, 1, 3
		var alpha = sqr(800/position.r);
		if (alpha > 1) alpha = 1;
		if (alpha < 0) alpha = 0;

		if (alpha < 1/1000) return;

		alpha *= 2;
		var index = Math.min(Math.floor(alpha), 2);
		var value = alpha - index;
		var color = [
			(colors[index][0]*(1-value) + value*colors[index+1][0]).toFixed(0),
			(colors[index][1]*(1-value) + value*colors[index+1][1]).toFixed(0),
			(colors[index][2]*(1-value) + value*colors[index+1][2]).toFixed(0),
			(colors[index][3]*(1-value) + value*colors[index+1][3]).toFixed(3)
		].join(',');

		var radius = position.r;
		// Meters to degree
		radius = radius*360/40074000;
		// projection
		radius = radius/Math.cos(position.y*Math.PI/180);
		// scale
		radius = radius*zoom;

		var xp = projectX(position.x);
		var yp = projectY(position.y);

		console.log(index, value, color, xp, yp, radius);

		ctx.fillStyle = 'rgba('+color+')';
		ctx.beginPath();
		ctx.arc(xp, yp, radius, 0, 2 * Math.PI, false)
		ctx.fill();
	})

	fs.writeFileSync(file+'.png', canvas.toBuffer());
	//fs.writeFileSync(file+'.raw', buffer2);
}
function linearProjection() {
	return {
		toGeoX:   function (x) { return xCenter + stretch*(x - width /2)/zoom },
		toGeoY:   function (y) { return yCenter -         (y - height/2)/zoom },
		toPixelX: function (x) { return (  x - xCenter )*zoom/stretch + width /2 },
		toPixelY: function (y) { return (-(y - yCenter))*zoom         + height/2 }
	}
}

function mercatorProjection() {
	function p(v) {
		v = v*Math.PI/180;
		v = Math.log(Math.tan(v/2 + Math.PI/4));
		v = v*180/Math.PI;
		return v;
	}
	function d(v) {
		v = v*Math.PI/180;
		v = 2*Math.atan(Math.exp(v)) - Math.PI/2;
		v = v*180/Math.PI;
		return v;
	}
	var yCenMer = p(yCenter);
	return {
		toGeoX:   function (x) { return   xCenter + (x - width /2)/zoom  },
		toGeoY:   function (y) { return d(yCenMer - (y - height/2)/zoom) },
		toPixelX: function (x) { return (    x  - xCenter )*zoom + width /2 },
		toPixelY: function (y) { return (-(p(y) - yCenMer))*zoom + height/2 }
	}
}

function sqr(v) {
	return v*v;
}

