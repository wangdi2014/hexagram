// state.js
// An object to write and load state

var app = app || {}; // jshint ignore:line

PAGE = 'homePage';

(function (hex) { // jshint ignore:line
    //'use strict';

    var DEFAULT_PROJECT = 'data/pancan12/first/',
        DEFAULT_SORT = {
            text: 'Density of attributes',
            type: 'default',
            focus_attr: null,
        },
        urlProject = null,
        proxPre,
        localStorageName;

    // Prefix for images and other such files
    if (location.host === 'localhost:3000') {
        proxPre = '';
    } else if (location.host === 'medbook.ucsc.edu') {
        proxPre = '/hex/';
        DEFAULT_PROJECT = 'data/ynewton/gliomas-paper/';
    } else if (DEV) {
        proxPre = '/hexmap/'; // su2c-dev:DEV
    } else {
        proxPre = '/hex/'; // su2c-dev:notDEV
    }
    DEFAULT_PROJECT = proxPre + DEFAULT_PROJECT;

    // Keep localStore of different development versions separate
    storeName = proxPre + '-hexMapState';

    // Find the project if one was included in the URL, replacing every '.' with '/'
    if ( window.location.search.indexOf( '?p=' ) > -1 ) {
        urlProject = proxPre
            + 'data/'
            + window.location.search.slice(3).replace(/\./g, '/')
            + '/';
    }

    State = function() {

        // The state stores the values used across modules for different
        // purposes. These may belong to this object or to the reactive meteor
        // Session. Eventually maybe all of this object's vars will be migrated
        // to meteor Session vars.
        //
        //      - localStorage: persist for the duration of the browser tab
        //          session, that is, they remain as long as the browser tab
        //          is used and not closed. These are written to the browser's
        //          localStorage
        //
        //          - project localStorage: a subset that are cleared when the
        //              project changes because they may not apply to the new
        //              project
        //
        //      - other: persist for this page load only, and are not saved to
        //          localStorage. Some of these belong to this object and some to
        //          the reactive meteor Session. Not all of these vars are
        //          initialized here, but in their respective file
        //          initialization functions

        var s = this;

        s.localStorage = {
            all: [
                'background',
                'center',
                'current_layout_name',
                'gridZoom',
                'page',
                'project',
                'zoom',
            ],

            // These are cleared when the project changes
            project: [
                'center',
                'current_layout_name',
                'gridZoom',
                'zoom',
            ],
        }
        s.alreadySaved = false;

        // Variables maintained in the meteor session
        Session.setDefault('page', PAGE);
        Session.setDefault('background', 'black');  // Visualization background color
        Session.setDefault('proxPre', proxPre);  // Prefix for images and other such files
        Session.setDefault('sort', DEFAULT_SORT); // Default sort message & type

        // Variables maintained in this state object, with defaults.
        s.project = DEFAULT_PROJECT;  // The project data to load
    }

    State.prototype.defaultProject = function () {
        return DEFAULT_PROJECT;
    };

    State.prototype.defaultSort = function () {
        return DEFAULT_SORT
    };

    State.prototype.setProjectDefaults = function () {
        var s = this;

        // Project variables maintained in this state object, with defaults.
        s.gridZoom = 1;  // Zoom level of the grid
        s.layout_names = [];  // Map layout names maintained in order of entry
        s.zoom = 1;  // Map zoom level where 1 is one level above most zoomed out
        s.center = null;
    }

    State.prototype.clearProjectData = function () {
        var s = this;

        // Clear any old project data from the state
        _.each(s.localStorage.project, function (key) {

            // If this is a Session var remove it from there
            if (!Session.equals(key, undefined)) {
                Session.set(key, undefined);
                delete Session.keys[key];

            // If this var belongs to this state object, remove it from here
            } else if (!_.isUndefined(s[key]) && !_.isNull(s[key])) {
                delete s[key];
            }
        });
        s.setProjectDefaults();
    };

    State.prototype.save = function (newProject) {
        // Save state by writing it to local browser store.
        // newProject is optional.
        var s = this,
            store = {},
            index,
            isNewProject = !_.isUndefined(newProject);

        if (s.alreadySaved) {
            return;
        }
        s.alreadySaved = true;

        // If we have a new project, clear any state related to the old project
        if (isNewProject && newProject !== s.project) {
            s.project = newProject;
            s.clearProjectData();
        }

        // Find all of the vars to be saved by walking though our localStorage list
        _.each(s.localStorage.all, function (key) {

            // If this is a Session var we want to store it there
            if (!Session.equals(key, undefined)) {
                store[key] = Session.get(key);

            // If this var belongs to this ctx object we want to store it here
            } else if (!_.isUndefined(s[key]) && !_.isNull(s[key])) {
                if (key === 'center') {
                    if (Array.isArray(ctx.center)) {

                        // No need to translate from LatLng to array
                        store.center = ctx.center;
                    } else {
                        // We need to store this as an array of two numbers rather
                        // than as latLng since when we retrieve it, we won't know
                        // about google maps yet so won't understand LatLng.
                        store.center = [ctx.center.lat(), ctx.center.lng()];
                    }
                } else {
                    store[key] = s[key];
                }
            // This var has no value to store
            } else {
                return;
            }
        });

        // Overwrite the previous state in localStorage
        window['localStorage'].removeItem(storeName);
        window['localStorage'].setItem(storeName, JSON.stringify(store));
    };

    State.prototype.load = function () {

        // Load state from local store
        var s = this,
            page = Session.get('page'),
            store = JSON.parse(window['localStorage'].getItem(storeName));

        // Reset the already saved flag
        s.alreadySaved = false;

        if (store === null) {
            console.log("No saved state found, so using defaults.");

        } else {

            // Walk through the localStorage loading anything we recognize
            _.each(store, function (val, key) {

                if (key === 'page') {
                    page = val; // Don't set the session var yet, page may change
                    return;
                }
                // Skip those we don't know
                if (s.localStorage.all.indexOf(key) < 0) {
                    return;
                }
                // Load this object's vars into this state if maintained in this state
                if (!_.isUndefined(s[key])) {
                    s[key] = val;

                // Otherwise assume this is a Session var and load it into there
                } else {
                    Session.set(key, val);
                }
            });
        }

        if (urlProject) {

            // Override the project if one was passed in the URL and different
            // from the current project. Go to the map page
            if (s.project != urlProject) {
                s.project = urlProject;
                s.clearProjectData();
            }
            page = 'mapPage';
        }

        Session.set('page', page);
    };

    function checkLocalStore () {

        // Check to see if browser supports HTML5 Store
        // Any modern browser should pass.
        // TODO if a browser does not support this, there is no way for a user
        // to change projects. Project could be passed in the URL
        try {
            "localStorage" in window && window["localStorage"] !== null;
        } catch (e) {
            banner("error", "Browser does not support local storage.");
            return false;
        }
        return true;
    }

    initState = function () { // jshint ignore:line
        var storageSupported = checkLocalStore(),
            s = new State();
            s.setProjectDefaults();

        if (storageSupported) {
            s.load();

            // Create a listener to know when to save state
            window.onbeforeunload = function() {
                s.save();
            }
        }
        return s;
    };
})(app);

