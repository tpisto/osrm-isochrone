var isolines = require('turf-isolines'),
    grid = require('turf-grid'),
    destination = require('turf-destination'),
    point = require('turf-point'),
    distance = require('turf-distance'),
    extent = require('turf-extent'),
    featureCollection = require('turf-featurecollection'),
    polylineDecode = require('polyline').decode,
    OSRM = require('osrm');

module.exports = function (center, time, options, done) {
    if (!options) throw 'options is mandatory';
    if (!options.resolution) throw 'resolution is mandatory in options';
    if (!options.network) throw 'network is mandatory in options';
    if (!options.maxspeed) throw 'maxspeed is mandatory in options';
    var unit = options.unit || 'miles';
    if (options && options.draw) {
        this.draw = options.draw;
    } else {
        this.draw = function(destinations) {
          return isolines(destinations, 'eta', options.resolution, [time]);
        };
    }

    this.getIsochrone = function() {
        var osrm = options.network instanceof OSRM ? options.network : new OSRM(options.network);
        // compute bbox
        // bbox should go out 1.4 miles in each direction for each minute
        // this will account for a driver going a bit above the max safe speed
        var centerPt = point(center[0], center[1]);
        var spokes = featureCollection([]);
        var length = (time/3600) * options.maxspeed;
        spokes.features.push(destination(centerPt, length, 180, unit));
        spokes.features.push(destination(centerPt, length, 0, unit));
        spokes.features.push(destination(centerPt, length, 90, unit));
        spokes.features.push(destination(centerPt, length, -90, unit));
        var bbox = this.bbox = extent(spokes);
        var sizeCellGrid = this.sizeCellGrid = distance(point(bbox[0], bbox[1]), point(bbox[0], bbox[3]), unit) / options.resolution;

        //compute destination grid
        var targets = grid(bbox, options.resolution);
        targets.features = targets.features.filter(function(feat) {
            return distance(point(feat.geometry.coordinates[0], feat.geometry.coordinates[1]), centerPt, unit) <= length;
        });
        var destinations = featureCollection([]);

        var coord = targets.features.map(function(feat) {
            return new Array(feat.geometry.coordinates[0], feat.geometry.coordinates[1])
        });

        // Changes for OSRM API v5.0.0->
        coordinates = [].concat([[center[0], center[1]]], coord)
        dests = Array.from(Array(coordinates.length-1).keys())
        dests.shift()

        var tableOptions = {
          coordinates: coordinates,
          sources: [0],
          destinations: dests
        }

        osrm.table(tableOptions, function(err, res) {
            if (err) {
                console.log(err);
                return done(err);
            }
            res.durations[0].forEach(function(time, idx) {
                var distanceMapped = distance(
                    point(coord[idx][0], coord[idx][1]),
                    point(res.destinations[idx].location[0], res.destinations[idx].location[1]),
                    unit
                );
                if (distanceMapped < sizeCellGrid) {
                    destinations.features.push({
                        type: 'Feature',
                        properties: {
                            eta: time
                        },
                        geometry: {
                            type: 'Point',
                            coordinates: [res.destinations[idx].location[0], res.destinations[idx].location[1]]
                        }
                    });
                }
            });
            var result = self.draw(destinations);
            return done(null, result);
            }
        );
    };
    var self = this;

    // in case module is called directly
    if (this.process && this.process.title == 'node')
        return getIsochrone();
}
