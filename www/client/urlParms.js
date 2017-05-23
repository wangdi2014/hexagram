// urlParms.js
// Handle project parameters in the URL.
// Bookmarks and page-only parms are handled in state.js.

var app = app || {};
(function (hex) { // jshint ignore: line
UrlParms = (function () { // jshint ignore: line

    var store = {},
        xenaAttrsAwaiting = [];

    function fixUpProjectNames (project) {
 
        // Fix up some project names that we've aleady given out to people
        // before reorganizing projects and implementing logins
        var xlate = {
            'evanPaull/pCHIPS': 'pCHIPS',
            'ynewton/gliomas-paper': 'Gliomas',
            'Pancan12.GeneMap': 'Pancan12/GeneMap',
            'Pancan12.SampleMap': 'Pancan12/SampleMap',
            'CKCC.v1': 'CKCC/v1',
            'CKCC.v2': 'CKCC/v2',
        };
        if (xlate[project]) {
            project = xlate[project];
        }
        return project + '/';
    };
    
    function loadOverlayNodes (P, store) {
    
        // Find any overlay nodes in the URL
        if (P.x && P.y) {

            // Split the comma-separated values into arrays
            // TODO: are multiple x's and y's being used anywhere?
            // I think not because top neighbor attributes became too
            // complicated to parse and we use a bookmark for multiple nodes
            var xs = P.x.split(","),
                ys = P.y.split(","),
                // TODO: this won't work if there is a comma in a node name!
                nodes = (!P.node) ? [] : P.node.split(",");

            store.overlayNodes = {};
            _.each(xs, function (x, i) {
            
                // If there is a y-value for this x-value...
                if (ys.length > i) {
                
                    // If there is no node name, use the index as the name.
                    if (nodes.length <= i) {
                        nodes[i] = i.toString();
                    }
                    store.overlayNodes[nodes[i]] = {x: xs[i], y: ys[i]};
                }
            });

            /* This is the old single overlay node in the url
            if (!P.node) {
                P.node = 'x';
            }
            store.overlayNodes = {};
            store.overlayNodes[P.node] = {x: P.x, y: P.y};
            */

        } else if (P.nodes) {

            // Load this group of nodes as overlay nodes
            store.overlayNodes = getOverlayNodeGroup(P.nodes);
        }
    }
    
    
    function receiveXenaAttr(dataIn, attrName) {
    
        // Receive the attributes requested from xena.
        // @param dataIn the data received in the form:
        //               {"_gender":[-0.567000,-0.525000,... ,
        //               "sampleID":["sampleID1", "sampleID2",...]}
        // @param attrName name of the attribute received

        // Reformat the attribute data.
        var data = {}
        _.each(dataIn.sampleID, function (id, i) {
            data[id] = dataIn[attrName][i];
        });
        
        // Build the layer and load it.
        var layer = {
                data: data,
                n: Object.keys(data).length,
                dynamic: true,
                imported: true,
            },
            dynLayer = {};
        dynLayer[attrName] = layer;
        
        Meteor.autorun(function (runner) {
            var initedLayerTypes = Session.get('initedLayerTypes'),
                shortlistInitDone = Session.get('shortlistInitDone');
            
            if (initedLayerTypes && shortlistInitDone) {
                runner.stop();
                Layer.with_layer(attrName, function() {}, dynLayer);
            }
        });
    }
    
    function queryXena(P) {

        // Find any xena requests.
        // @param P the url parameters
        // For example:
        // http://localhost:3333/?
        //      xena=addAttr&
        //      p=PancanAtlas_dev/XenaPancanAtlas&
        //      layout=RPPA&
        //      hub=https://pancanatlas.xenahubs.net/data/&
        //      dataset=TCGA_pancancer_10852whitelistsamples_68ImmuneSigs.xena&
        //      attr=B_cell_PCA_16704732
        // all together now:
        // http://localhost:3333/?xena=addAttr&p=PancanAtlas_dev/XenaPancanAtlas&layout=mRNA&hub=https://pancanatlas.xenahubs.net/data/&dataset=TCGA_pancancer_10852whitelistsamples_68ImmuneSigs.xena&attr=B_cell_PCA_16704732
        // A wget example:
        // wget -O foo -v --header='content-type:text/plain'
        //      --post-data='(xena-query {:select
        //      ["sampleID" "B_cell_PCA_16704732"] :from
        //      ["TCGA_pancancer_10852whitelistsamples_68ImmuneSigs.xena"]})'
        //      https://pancanatlas.xenahubs.net/data/

        if (P.xena === 'addAttr') {
        
            // Convert any single values to an array
            if (typeof(P.hub) !== 'object') {
                P.hub = [P.hub];
            }
            if (typeof(P.dataset) !== 'object') {
                P.dataset = [P.dataset];
            }
            if (typeof(P.attr) !== 'object') {
                P.attr = [P.attr];
            }

            // Iterate through the parm arrays grouping by array index.
            xenaAttrsAwaiting = [];
            _.each(P.hub, function (hub, i) {
                if (i < P.dataset.length && i < P.attr.length) {
                
                    // Build the xena query string.
                    var opts = '(xena-query {:select ["sampleID" "' +
                            P.attr[i] +
                            '"] :from ["' +
                            P.dataset[i] +
                            '"]})';
                   
                    // TODO the below won't work if attrs of same name but
                    // diff datasets
                    xenaAttrsAwaiting.push(P.attr[i]);
                   
                    // Retrieve this attribute's data from the xena hub.
                    $.ajax({
                        type: 'POST',
                        url: hub,
                        contentType: 'text/plain',
                        //dataType: 'json', // expects json returned
                        data: opts,
                        success:  function (result) {
                            receiveXenaAttr(result, P.attr[i]);
                        },
                        error: function (error) {
                            if (error) {
                                banner('error', error.responseText);
                            } else {
                                banner('error', 'Unknown server error');
                            }
                        }
                    });
                }
            });
        }
    }
 
    return {
    
        getParms: function () {
        
            // Retrieve the parameters in the url
            var parms = location.search.substr(1);
            var result = {};
            var found = false;
            parms.split("&").forEach(function(part) {
                if (part !== "") {
                    var item = part.split("="),
                        key = item[0],
                        val = decodeURIComponent(item[1]);
                        
                    // Do we already have a value for this key?
                    if (!(key in result)) {

                        // A brand new key, so a simple value
                        result[key] = val;
                    } else {
                        // There is a value for this key already.
     
                        if (typeof(val) !== 'object') {
                        
                            // This is a single value so turn it into an array.
                            result[key] = [result[key]]
                        }
                        // Add to the array.
                        result[key].push(val);
                    }
                    found = true;
                }
            });
            if (found) {
                return result;
            } else {
                return null;
            }
        },
  
        load: function (P) {
     
            // Load state from parameters in the url when a project is included.
            var store = {
                project: fixUpProjectNames(P.p),
                page: 'mapPage',
            }

            // Find any layout specified by index.
            if (P.li) {
                store.layoutIndex = P.li;
            
            // Find any layout name specified. Save it for later to set
            // the layoutIndex state variable.
            } else if (P.layout) {
                Session.set('layoutName', P.layout);
            }
            
            // Find any overlay nodes in the URL
            if ((P.x && P.y) || P.nodes) { loadOverlayNodes(P, store); }

            // Find any xena requests
            if (P.xena) {
                queryXena(P);
                return store;
            } else {
            
                // Return the store without any delay from ajax
                return store;
            }
        },
    };
}());
})(app);