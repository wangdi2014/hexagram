// Handle the mixing of colors.

import '/imports/lib/color.js';
import Colormap from '/imports/mapPage/color/Colormap';
import hexagons from '/imports/mapPage/viewport/hexagons';
import Layer from '/imports/mapPage/longlist/Layer';
import legend from '/imports/mapPage/color/legend';
import rx from '/imports/common/rx';
import shortlist from '/imports/mapPage/shortlist/shortlist';
import util from '/imports/common/util';

// Previous active attrs and filters.
let pActiveAttrs = null
let pFilterBy = [null]
let pFilterVal = [null]
let refreshTimer

function get_range_position(scoreIn, low, high, filterBy) {
    // Given a score float, and the lower and upper bounds of an interval (which
    // may be equal, but not backwards), return a number in the range -1 to 1
    // that expresses the position of the score in the [low, high] interval.
    // Positions out of bounds are clamped to -1 or 1 as appropriate.
    
    // This holds the length of the input interval
    var interval_length = high - low;
    var score = scoreIn
    if(interval_length > 0) {
    
        if (filterBy === 'threshold') {
        
            // If the score is out of bounds, set it to lower or upper bound.
            if (score < low) {
                score = low
            } else if (score > high) {
                score = high
            }
        }
    
        // First rescale 0 to 1
        score = (score - low) / interval_length;
        
        // Clamp
        score = Math.min(Math.max(score, 0), 1);
            
        // Now re-scale to -1 to 1
        score = 2 * score - 1;
    } else {
        // The interval is just a point
        // Just use 1 if we're above the point, and 0 if below.
        score = (score > low)? 1 : -1;
    }
    
    return score;
}

function findContinuousFilters (current_layers) {

    // Set up the limits for continuous attrs.
    let filterBys = rx.get('shortEntry.menu.filter')
    let filterVals = rx.get('shortEntry.filter')
    var layer_limits = [];
    var filterBy = []
    current_layers.forEach(function (attr) {
        let dataType = util.getDataType(attr)
        
        // Values for non-continuous attrs.
        let range = null
        let by = null
        if (dataType === 'continuous') {
            
            // Default the values as if there is no filter,
            // which is the same as filter by range using min and max.
            range = [layers[attr].minimum, layers[attr].maximum]
            by = 'range'
            if (filterBys[attr] === 'range' ||
                filterBys[attr] === 'threshold') {
                by = filterBys[attr]
                if (filterVals[attr]) {
                    range = filterVals[attr].value
                }
            }
        }
        layer_limits.push(range)
        filterBy.push(by)
    })

    return {by: filterBy, range: layer_limits}
}

export function refreshColors () {

    // Make the view display the correct hexagons in the colors of the current
    // layer(s), as read from the values of the layer pickers in the global
    // layer pickers array.
    // All pickers must have selected layers that are in the object of 
    // layers.
    // Instead of calling this, you probably want to call refreshColors().
    
    // Don't do multiple refreshes during initialization.
    if (rx.get('init.map') !== 'rendered') {
        return;
    }
    
    console.log('refreshColors()')
    
    // This holds a list of the string names of the currently selected layers,
    // in order.
    var current_layers = shortlist.get_active_coloring_layers();
    
    // This holds all the current filters
    var filters = shortlist.get_current_filters();
 
    // Special case of no layers at all.
    if (_.isUndefined(layers) || Object.keys(layers) < 1) {
        for(var signature in polygons) {
            hexagons.setOneColor(polygons[signature], Colormap.noAttrsColor());
        }
        return;
    }
    
    // Obtain the layer objects (mapping from signatures/hex labels to colors)
    Layer.with_many(current_layers, function(retrieved_layers) {  

        // This holds arrays of the lower and upper limit we want to use for 
        // each layer, by layer number. The lower limit corresponds to u or 
        // v = -1, and the upper to u or v = 1. The entries we make for 
        // colormaps are ignored.
        
        // We need to do this inside the callback, once we already have the
        // layers, so that we use the newest slider range endpoints.
        var at_least_one_layer = retrieved_layers.length >= 1;
        var two_layers = retrieved_layers.length >= 2;
        
        // Set up the limits for continuous attrs.
        let continuousFilter = findContinuousFilters(current_layers)
        let filterBy = continuousFilter.by
        let layer_limits =  continuousFilter.range

        // Go get the list of filter-passing hexes.
        shortlist.with_filtered_signatures(filters, function(signatures) {
            for (let sig in polygons) {
                if (signatures.indexOf(sig) < 0) {
                    hexagons.setOneColor(polygons[sig], Colormap.noDataColor());
                    continue
                }
                var label = sig
                // This holds the color we are calculating for this hexagon.
                // Start with the no data color.
                var computed_color = Colormap.noDataColor();
                
                if(at_least_one_layer) {
                    // We need to compute colors given the layers we found.

                    // Get the heat along u and v axes. This puts us in a square
                    // of side length 2. Fun fact: undefined / number = NaN, but
                    // !(NaN == NaN)
                    var u = retrieved_layers[0].data[label];
                    
                    if(util.is_continuous(current_layers[0])) {
                        // Take into account the slider values and re-scale the
                        // layer value to express its position between them.
                        u = get_range_position(u, layer_limits[0][0], 
                            layer_limits[0][1], filterBy[0]);
                    }
                    
                    if(two_layers) {
                        // There's a second layer, so use the v axis.
                        var v = retrieved_layers[1].data[label];
                        
                        if(util.is_continuous(current_layers[1])) {
                            // Take into account the slider values and re-scale
                            // the layer value to express its position between
                            // them.
                            v = get_range_position(v, layer_limits[1][0], 
                                layer_limits[1][1], filterBy[1]);
                        }
                        
                    } else {
                        // No second layer, so v axis is unused. Don't make it
                        // undefined (it's not missing data), but set it to 0.
                        v = 0;
                    }
                    
                    // Either of u or v may be undefined (or both) if the layer
                    // did not contain an entry for this signature. But that's
                    // OK. Compute the color that we should use to express this
                    // combination of layer values. It's OK to pass undefined
                    // names here for layers.
                    computed_color = get_color(current_layers[0], u,
                        current_layers[1], v);
                }
                    
                // Set the color by the composed layers.
                hexagons.setOneColor(polygons[label], computed_color);
            }
        });

        legend.redraw(retrieved_layers, current_layers);
    });
    
    // Make sure to also redraw the info window, which may be open.
    import infoWindow from '/imports/mapPage/viewport/infoWindow.js';
    infoWindow.redraw();
}

function refreshColorByState () {

    // Check state to see if colors need refreshing.
    let update = false
    let activeAttrs = rx.get('active.attrs')
    let filterBy = []
    let filterVal = []
    
    // First compare active coloring attrs.
    if (!rx.isArrayEqual(activeAttrs, pActiveAttrs)) {
        update = true
    }
    
    // For each active attr.
    if (activeAttrs) {
        for (let i = 0; i < activeAttrs.length; i++) {
            filterBy[i] = rx.get('shortEntry.menu.filter')[activeAttrs[i]]
            filterVal[i] = rx.get('shortEntry.filter')[activeAttrs[i]]

            // If we haven't found a need to update yet...
            if (!update) {
            
                // Compare the filterBy.
                if (filterBy[i] === pFilterBy[i]) {
            
                    // Compare the filter values.
                    if (filterVal[i].value.length === pFilterVal[i].value.length) {
                        let j = 0
                        while (j < filterVal[i].value.length) {
                            if (filterVal[i].value[j] !== pFilterVal[i].value[j]) {
                                update = true
                                break
                            }
                            j++
                        }
                    }
                }
            }
        }
    }
    if (update) {
        pActiveAttrs = activeAttrs
        pFilterBy = filterBy
        pFilterVal = filterVal
        let i = 0
        let receivedAttrs = true
        if (activeAttrs) {
            while (i < activeAttrs.length) {
                if (layers[activeAttrs[i]].status !== 'received') {
                    receivedAttrs = false
                    break
                }
                i++
            }
        }
        if (receivedAttrs) {
            //refreshColors()
            
            // Use a timeout to throttle the color refreshes.
            clearTimeout(refreshTimer)
            refreshTimer = setTimeout(refreshColors)
        }
    }
}

export function get_color (layerName1, layerVal1, layerName2, layerVal2) {
    // Either layer value may be undefined (or both), in which case the no-data color
    // is returned. If a layer name is undefined, that layer dimension is
    // ignored.

    var color,
        base_color,
        hsv_value;

    // These are all cases we need to pay attention to.
    var onlyOneLayer = _.isUndefined(layerName2);

    var oneBinaryLayer = (
        onlyOneLayer &&
        util.is_binary(layerName1)
    );

    var oneContinuousLayer = (
        onlyOneLayer &&
        !oneBinaryLayer &&
        util.is_continuous(layerName1)
    );

    var oneCategoricalLayer = (
        onlyOneLayer &&
        !oneBinaryLayer &&
        !oneContinuousLayer
    );

    var bothContinuous = (
        !onlyOneLayer &&
        util.is_continuous(layerName1) &&
        util.is_continuous(layerName2)
    );

    var continuousAndCatOrBin =(
        !onlyOneLayer &&
        util.is_cat_or_bin(layerName2) &&
        util.is_continuous(layerName1)
    );

    var catOrBinAndContinous = (
        !onlyOneLayer &&
        !continuousAndCatOrBin &&
        util.is_cat_or_bin(layerName1) &&
        util.is_continuous(layerName2)
    );

    var catAndCatOrBin=(
        !onlyOneLayer &&
        util.is_categorical(layerName1) &&
        util.is_cat_or_bin(layerName2) ||
        util.is_categorical(layerName2) &&
        util.is_cat_or_bin(layerName1)
    );


    var bothLayersBinary = (
        util.is_binary(layerName1) && util.is_binary(layerName2)
    );

    var any_missing_values =(
        isNaN(layerVal1) ||
        isNaN(layerVal2) ||
        _.isUndefined(layerVal1) ||
        _.isUndefined(layerVal2)
    );

    var on = 1;
    var off = 0;

    if(continuousAndCatOrBin) {
        //Manipulate the ordering of arguments so an extra case is not needed.
        color = get_color(layerName2, layerVal2, layerName1, layerVal1);

    } else if (any_missing_values) {
        color = Colormap.noDataColor();

    } else if(oneBinaryLayer) {
        // User's choice from color map or default.
        if(layerVal1 === on) { // layerVal1 is 1
            color =  Colormap.binaryOnColor(layerName1);
        } else if (layerVal1 === off) { // layerVal1 is 0
            color = Colormap.binaryOffColor(layerName1);
        } else {
            throw "There was an error making the color of the binary layer";
        }

    } else if(bothLayersBinary) {
        // Special color scheme for two binaries,
        // always uses default, never choice from user.
        if(layerVal1 === on) {
            if(layerVal2 === on) {
                // Both are on
                return Colormap.defaultBinBothOn();
            } else if (layerVal2 === off) {
                // Only the first is on
                return Colormap.defaultBinaryOn();
            }
        } else if (layerVal1 === off) {
            if(layerVal2 === on) {
                // Only the second is on
                return Colormap.defaultSecondBinOn();
            } else if (layerVal2 === off) {
                // Neither is on
                return Colormap.defaultBinaryOff();
            }
        }

    } else if (oneCategoricalLayer) {
        base_color = baseCategoricalColor(layerName1, layerVal1);
        base_color.value(base_color.value());
        color = base_color.hexString();

    } else if (catAndCatOrBin) {
        base_color = baseCategoricalColor(layerName1, layerVal1);
        // Do discrete shades of second layer.
        // Calculate what shade we need from second layer value
        // We want 100 to be included (since that's full brightness), but we
        // want to skip 0 (since no color can be seen at 0), so we add 5 to
        // the second layer's value.
        var colorCountL2 = Colormap.findColorCount(layerName2);
        hsv_value = (layerVal2 + 1) / colorCountL2 * 100;
        base_color.value(hsv_value);
        color = base_color.hexString();

    } else if (catOrBinAndContinous) {
        base_color = baseCategoricalColor(layerName1, layerVal1);
        // Calculate what shade we need from v on -1 to 1, with a minimum
        // value of 20 to avoid blacks.
        hsv_value = 60 + layerVal2 * 40;
        base_color.value(hsv_value);
        color = base_color.hexString();

    } else if(oneContinuousLayer) {
        // Sets the interpolation so the second color is not mixed.
        // Chooses the user's specified coloring or
        color = mixOneContinuous(layerName1, layerVal1);
    } else if (bothContinuous) {
        color = mix2Continuos(layerVal1, layerVal2);
    } else {
        throw "An error occurred when determining a nodes color.";
    }

    return color;
}

function baseCategoricalColor(layerName, layerValue) {
    var base_color;
    if(colormaps[layerName].hasOwnProperty(layerValue)) {
        // And the colormap has an entry here. Use it as the base color.
        var to_clone = colormaps[layerName][layerValue].color;

        base_color = Color({
            hue: to_clone.hue(),
            saturation: to_clone.saturationv(),
            value: to_clone.value()
        });
    } else {
        // Something went wrong. This case catches when a value in the layer
        // doesn't have a colormap entry.
        // This conforms to the old code (since refactored),
        // which hid the error by skipping the category.
        base_color = Color({
            red : undefined,
            blue : undefined,
            green : undefined
        });
    }
    return base_color;
}

function mix (a, b, amount) {
    // Mix between the numbers a and b, where an amount of -1 corresponds to a,
    // and an amount of +1 corresponds to b.
    
    // Convert to 0 to 1 range.
    var i = (amount + 1) / 2;
    
    // Do the linear interpolation.
    return i * a + (1 - i) * b;
    
}

function mix2 (a, b, c, d, amount1, amount2) {
    // Mix between a and b (or c and d) on amount1, and then mix between the
    // results on amount2. Amounts are in range -1 to 1.
    
    return mix(mix(a, b, amount1), mix(c, d, amount1), amount2);
}

function parseColorPortions(hexStr){

    var portion_prefix = "0x";
    var red_portion = parseInt(portion_prefix + hexStr.slice(1,3));
    var green_portion = parseInt(portion_prefix + hexStr.slice(3,5));
    var blue_portion = parseInt(portion_prefix + hexStr.slice(5,7));

    return {
        "red" : red_portion,
        "green" : green_portion,
        "blue" : blue_portion,
    };
}

function colorify(red, green, blue){
    var color = "rgb(" + red + "," + green + "," + blue + ")";
    return color;
}

function mixOneContinuous(layerName, layerValue){
    var ignoreValue = -1;
    var ignoreColor = 0;
    var highColor = Colormap.continuousHighColor(layerName);
    var lowColor = Colormap.continuousLowColor(layerName);
    var highColorParsed = parseColorPortions(highColor);
    var lowColorParsed = parseColorPortions(lowColor);

    var red = mix2(
        lowColorParsed["red"],
        highColorParsed["red"],
        ignoreColor, ignoreColor,
        -layerValue, -ignoreValue
    ).toFixed(0);

    var green = mix2(
        lowColorParsed["green"],
        highColorParsed["green"],
        ignoreColor, ignoreColor,
        -layerValue, -ignoreValue
    ).toFixed(0);

    var blue = mix2(
        lowColorParsed["blue"],
        highColorParsed["blue"],
        ignoreColor, ignoreColor,
        -layerValue, -ignoreValue
    ).toFixed(0);

    var color = colorify(red, green, blue);

    return color;
}

function mix2Continuos(layerVal1, layerVal2){
    // Ignore color map entries.
    var highColor1 = Colormap.defaultContHigh();
    var lowColor1 = Colormap.defaultContLow();
    var lowColor1HighColor2 = Colormap.defaultCont2High1Low();
    var bothHighColor = Colormap.defaultContBothHigh();

    var high1Parsed = parseColorPortions(highColor1);
    var low1Parsed = parseColorPortions(lowColor1);
    var lowHighParsed = parseColorPortions(lowColor1HighColor2);
    var bothHighParsed = parseColorPortions(bothHighColor);

    var red = mix2(
        low1Parsed["red"],
        high1Parsed["red"],
        lowHighParsed["red"],
        bothHighParsed["red"],
        -layerVal1, -layerVal2
    ).toFixed(0);

    var green = mix2(
        low1Parsed["green"],
        high1Parsed["green"],
        lowHighParsed["green"],
        bothHighParsed["green"],
        -layerVal1, -layerVal2
    ).toFixed(0);

    var blue = mix2(
        low1Parsed["blue"],
        high1Parsed["blue"],
        lowHighParsed["blue"],
        bothHighParsed["blue"],
        -layerVal1, -layerVal2
    ).toFixed(0);

    var color = colorify(red, green , blue);

    return color;
}

export function init () {
    rx.subscribe(refreshColorByState)
}
