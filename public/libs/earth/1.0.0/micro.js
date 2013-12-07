
var µ = function() {
    "use strict";

    // now that using _, any of these redundant now?

    var τ = 2 * Math.PI;

    /**
     * @returns {Boolean} true if the specified value is truthy.
     */
    function isTruthy(x) {
        return !!x;
    }

    /**
     * @returns {Boolean} true if the specified value is not null and not undefined.
     */
    function isValue(x) {
        return x !== null && x !== undefined;
    }

    /**
     * @returns {Object} the first argument if not null and not undefined, otherwise the second argument.
     */
    function coalesce(a, b) {
        return isValue(a) ? a : b;
    }

    function floorDiv(a, n) {
        // floored division: http://en.wikipedia.org/wiki/Modulo_operation
        return a - n * Math.floor(a / n);
    }

    function distance(a, b) {
        var Δx = b[0] - a[0];
        var Δy = b[1] - a[1];
        return Math.sqrt(Δx * Δx + Δy * Δy);
    }

    function clamp(x, bounds) {
        return Math.max(bounds[0], Math.min(x, bounds[1]));
    }

    function toUTCISO(date) {
        return date.getUTCFullYear() + "-" +
            (date.getUTCMonth() + 101).toString().substr(1) + "-" +
            (date.getUTCDate() + 100).toString().substr(1) + " " +
            (date.getUTCHours() + 100).toString().substr(1) + ":00";
    }

    function toLocalISO(date) {
        return date.getFullYear() + "-" +
            (date.getMonth() + 101).toString().substr(1) + "-" +
            (date.getDate() + 100).toString().substr(1) + " " +
            (date.getHours() + 100).toString().substr(1) + ":00";
    }

    /**
     * @returns {Object} an object to perform logging, if/when the browser supports it.
     */
    function log() {
        function format(o) { return o && o.stack ? o + "\n" + o.stack : o; }
        return {
            debug:   function(s) { if (console && console.log) console.log(format(s)); },
            info:    function(s) { if (console && console.info) console.info(format(s)); },
            error:   function(e) { if (console && console.error) console.error(format(e)); },
            time:    function(s) { if (console && console.time) console.time(format(s)); },
            timeEnd: function(s) { if (console && console.timeEnd) console.timeEnd(format(s)); }
        };
    }

    /**
     * @returns {width: (Number), height: (Number)} an object that describes the size of the browser's current view.
     */
    function view() {
        var w = window;
        var d = document && document.documentElement;
        var b = document && document.getElementsByTagName("body")[0];
        var x = w.innerWidth || d.clientWidth || b.clientWidth;
        var y = w.innerHeight || d.clientHeight || b.clientHeight;
        return {width: x, height: y};
    }

    /**
     * Returns a promise for a JSON resource (URL) fetched via XHR. If the load fails, the promise rejects with an
     * object describing the reason: {status: http-status-code, message: http-status-text, resource:}.
     */
    function loadJson(resource) {
        var d = when.defer();
        d3.json(resource, function(error, result) {
            return error ?
                !error.status ?
                    d.reject({status: -1, message: "Cannot load resource: " + resource, resource: resource}) :
                    d.reject({status: error.status, message: error.statusText, resource: resource}) :
                d.resolve(result);
        });
        return d.promise;
    }

    function parse(hash, projectionNames) {
        //  hash   := ( "current" | yyyy / mm / dd / hhhh "Z" ) / param / surface / level [ / option [ / option ... ] ]
        //  option := type [ "=" number [ "," number [ ... ] ] ]
        //  example: 2013/11/14/0900Z/wind/isobaric/1000hPa/orthographic=26.50,-153.00,1430
        var tokens, option, result = {};
        if ((tokens = /^(current|\d{4}\/\d{2}\/\d{2}\/(\d{4})Z)\/(\w+)\/(\w+)\/(\w+)([\/].+)?/.exec(hash))) {
            result = {
                date: tokens[1].substr(0, 10),    // "current" or "yyyy/mm/dd"
                hour: coalesce(tokens[2], ""),    // "hhhh" or ""
                param: tokens[3],                 // non-empty alphanumeric _
                surface: tokens[4],               // non-empty alphanumeric _
                level: tokens[5],                 // non-empty alphanumeric _
                projection: "orthographic",
                orientation: "",
                topology: TOPOLOGY,
                overlay: "wv"
            };
            coalesce(tokens[6], "").split("/").forEach(function(segment) {
                if ((option = /^(\w+)(=([\d\-.,]*))?$/.exec(segment))) {
                    if (projectionNames.has(option[1])) {
                        result.projection = option[1];                 // non-empty alphanumeric _
                        result.orientation = coalesce(option[3], "");  // comma delimited string of numbers, or ""
                    }
                }
                else if ((option = /^overlay=off$/.exec(segment))) {
                    result.overlay = "off";
                }
            });
        }
        return result;
    }

    var DEFAULT_CONFIG = "current/wind/isobaric/1000hPa/orthographic";
    var TOPOLOGY = isMobile() ? "/data/earth-topo-mobile.json" : "/data/earth-topo.json";
    var Configuration = Backbone.Model.extend({
        id: 0,
        toHash: function() {
            var attr = this.attributes;
            var dir = attr.date === "current" ? "current" : attr.date + "/" + attr.hour + "Z";
            var proj = [attr.projection, attr.orientation].filter(isTruthy).join("=");
            var ol = attr.overlay === "off" ? "overlay=off" : "";
            return [dir, attr.param, attr.surface, attr.level, proj, ol].filter(isTruthy).join("/");
        },
        toPath: function() {
            var attr = this.attributes;
            var dir = attr.date;
            var stamp = dir === "current" ? "current" : attr.hour;
            var file = [stamp, attr.param, attr.surface, attr.level, "gfs", "1.0"].join("-") + ".json";
            return ["/data/weather", dir, file].join("/");
        },
        _ignoreNextHashChangeEvent: false,
        _projectionNames: null,
        sync: function(method, model, options) {  // UNDONE: how to test this logic?
            switch (method) {
                case "read":
                    if (options.trigger === "hashchange" && model._ignoreNextHashChangeEvent) {
                        model._ignoreNextHashChangeEvent = false;
                        return;
                    }
                    // log().debug("read: " + hash);
                    model.set(parse(window.location.hash.substr(1) || DEFAULT_CONFIG, model._projectionNames));
                    break;
                case "update":
                    // log().debug("update: " + model.toHash());
                    // Ugh. Setting the hash fires a hashchange event during the next event loop turn. Ignore it.
                    model._ignoreNextHashChangeEvent = true;
                    window.location.hash = model.toHash();
                    break;
            }
        }
    });

    function buildConfiguration(projectionNames) {
        var result = new Configuration();
        result._projectionNames = projectionNames;
        return result;
    }

    function ensureNumber(num, fallback) {
        return _.isFinite(num) || num === Infinity || num === -Infinity ? num : fallback;
    }

    /**
     * @param bounds the projection bounds: [[x0, y0], [x1, y1]]
     * @param view the view bounds {width:, height:}
     * @returns {Object} the projection bounds clamped to the specified view, as a structured object:
     *          {x:, y:, xMax:, yMax:, width:, height:}
     */
    function clampedBounds(bounds, view) {
        var upperLeft = bounds[0];
        var lowerRight = bounds[1];
        var x = Math.max(Math.floor(ensureNumber(upperLeft[0], 0)), 0);
        var y = Math.max(Math.floor(ensureNumber(upperLeft[1], 0)), 0);
        var xMax = Math.min(Math.ceil(ensureNumber(lowerRight[0], view.width)), view.width - 1);
        var yMax = Math.min(Math.ceil(ensureNumber(lowerRight[1], view.height)), view.height - 1);
        return {x: x, y: y, xMax: xMax, yMax: yMax, width: xMax - x + 1, height: yMax - y + 1};
    }

    function removeChildren(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    /**
     * Returns a color style string for the specified RGBA values.
     */
    function asColorStyle(r, g, b, a) {
        return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
    }

    function asRainbowColorStyle(hue, a) {
        // Map hue [0, 1] to radians [0, 5/6τ]. Don't allow a full rotation because that keeps hue == 0 and
        // hue == 1 from mapping to the same color.
        var rad = hue * τ * 5/6;
        rad *= 0.75;  // increase frequency to 2/3 cycle per rad

        var s = Math.sin(rad);
        var c = Math.cos(rad);
        var r = Math.floor(Math.max(0, -c) * 255);
        var g = Math.floor(Math.max(s, 0) * 255);
        var b = Math.floor(Math.max(c, 0, -s) * 255);
        return [r, g, b, a];
    }

    function colorStyles() {
        var result = [];
        for (var j = 85; j <= 255; j += 5) {
            result.push(asColorStyle(j, j, j, 1.0));
        }
        result.indexFor = function(m) {  // map wind speed to a style
            return Math.floor(Math.min(m, 17) / 17 * (result.length - 1));
        };
        return result;
    }

    function clearCanvas(canvas) {
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        return canvas;
    }

    function distortion(projection) {
        // gis.stackexchange.com/questions/5068/how-to-create-an-accurate-tissot-indicatrix
        // www.jasondavies.com/maps/tissot

        var r = Math.pow(10, -5.2);
        // CONSIDER: potentially useful for avoiding array allocations??
        // var px, py;
        // var stream = projection.stream({ point: function(x, y) { px = x; py = y; } });

        return function(λ, φ, x, y, du, dv) {
            var λ0 = λ > 0 ? λ - r : λ + r;
            var φ0 = φ > 0 ? φ - r : φ + r;

            var pλ = projection([λ0, φ]);
            var pφ = projection([λ, φ0]);

            if (!pλ || !pφ) {
                return false;
            }

            var Δλ = λ - λ0;
            var Δφ = φ - φ0;
            du[0] = (x - pλ[0]) / Δλ;
            du[1] = (pλ[1] - y) / Δλ;  // lat increases downward in pixel space
            dv[0] = (x - pφ[0]) / Δφ;
            dv[1] = (pφ[1] - y) / Δφ;  // lat increases downward in pixel space
            return true;
        };
    }

    /**
     * Returns a human readable string for the provided coordinates.
     */
    function formatCoordinates(λ, φ) {
        return Math.abs(φ).toFixed(2) + "º " + (φ >= 0 ? "N" : "S") + ", " +
            Math.abs(λ).toFixed(2) + "º " + (λ >= 0 ? "E" : "W");
    }

    /**
     * Returns a human readable string for the provided rectangular wind vector.
     */
    function formatVector(u, v) {
        var d = Math.atan2(-u, -v) / τ * 360;  // calculate into-the-wind cardinal degrees
        var wd = Math.round((d + 360) % 360 / 5) * 5;  // shift [-180, 180] to [0, 360], and round to nearest 5.
        var m = Math.sqrt(u * u + v * v);
        return wd.toFixed(0) + "º @ " + m.toFixed(1) + " m/s";
    }

    /**
     * @returns {Boolean} true if agent is probably firefox. Don't really care if this is accurate.
     */
    function isFF() {
        return (/firefox/i).test(navigator.userAgent);
    }

    /**
     * @returns {Boolean} true if agent is probably a mobile device. Don't really care if this is accurate.
     */
    function isMobile() {
        return (/android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i).test(navigator.userAgent);
    }

    return {
        isTruthy: isTruthy,
        isValue: isValue,
        coalesce: coalesce,
        floorDiv: floorDiv,
        distance: distance,
        clamp: clamp,
        toLocalISO: toLocalISO,
        toUTCISO: toUTCISO,
        log: log,
        view: view,
        loadJson: loadJson,
        parse: parse,
        buildConfiguration: buildConfiguration,
        clampedBounds: clampedBounds,
        removeChildren: removeChildren,
        asColorStyle: asColorStyle,
        asRainbowColorStyle: asRainbowColorStyle,
        colorStyles: colorStyles,
        clearCanvas: clearCanvas,
        distortion: distortion,
        formatCoordinates: formatCoordinates,
        formatVector: formatVector,
        isFF: isFF,
        isMobile: isMobile
    };

}();
