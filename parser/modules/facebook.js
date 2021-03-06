var fs = require('fs');
var moment = require('moment-timezone');

exports.import = function (config) {
	console.log('Parse Facebook');

	var wall = fs.readFileSync(config.inputPath+'facebook/html/wall.htm', 'utf8');
	wall = wall.replace(/[\n\r]/g, ' ');
	wall = wall.match(/\<\/h1\>(.*)\<div\ class\=\"footer/);
	wall = wall[1];
	wall = wall.split('<div class="meta">');

	wall = wall.map(function (entry) {
		var i = entry.indexOf('</div>');
		if (i < 0) return false;
		
		var date = entry.substr(0, i);
		date = moment.tz(date+':00', 'dddd, MMMM D, YYYY "at" H:mma "UTC"Z', 'en', 'Europe/Zurich');
		if (!date.isValid()) {
			console.error('wrong date', date);
			process.exit();
		}
		date = date.unix();

		var comment = entry.substr(i+6);
		comment = comment.replace(/<div class=\"comment\">/, ': ');
		comment = comment.replace(/<.*?>/g, '');

		return {
			type:'facebook',
			subject:comment,
			start:date,
			end:date,
			from:{
				address: 'facebook.com/balthasar.glaettli',
				contact: 'Balthasar Glättli',
				org: 'parl.ch'
			},
			to:[],
			inBound:false,
			outBound:true
		}
	})

	wall = wall.filter(function (entry) {
		return entry;
	})

	return wall;
}