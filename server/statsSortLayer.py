#!/usr/bin/env python2.7
"""
statsSortLayer.py
Object for generating one layer's sort stats for layout-aware & layout-ignore
and for both pre-computed and dynamic stats
"""

import sys, os, json, copy, csv, math, traceback, pprint
import scipy.stats

def sigDigs(x, sig=6):

    if sig < 1:
        raise ValueError("number of significant digits must be >= 1")

    # Use %e format to get the n most significant digits, as a string.
    format = "%." + str(sig-1) + "e"
    return float(format % x)

def is_number(x):
    try:
        float(x)
        return True
    except ValueError:
        return False

class ForEachLayer(object):

    def __init__(s, parm):

        # Required parameters
        s.directory = parm['directory']
        s.layerA = parm['layerA']
        s.layers = parm['layers']
        s.statsLayers = parm['statsLayers']

        if 'layout' in parm:

            # Layout-aware options:
            s.windowAdditives = parm['windowAdditives']
            s.windowNodes = parm['windowNodes']
            if 'writeFile' in parm:
                suffix = '_' + parm['layout'] + '.tab'
                filename = 'statsL_' + str(parm['layerIndex']) + suffix
                s.file = os.path.join(parm['directory'], filename)
        else:

            # Layout-ignore options:
            s.hexNames = parm['hexNames']

            # Save the data type lists and determine layerA's data type
            if 'binLayers' in parm:
                s.binLayers = parm['binLayers']
                if s.layerA in s.binLayers:
                    s.layerAtype = 'bin'
            if 'catLayers' in parm:
                s.catLayers = parm['catLayers']
                if s.layerA in s.catLayers:
                    s.layerAtype = 'cat'
            if 'contLayers' in parm:
                s.contLayers = parm['contLayers']
                if s.layerA in s.contLayers:
                    s.layerAtype = 'cont'

            if 'writeFile' in parm:
                s.temp_dir = parm['temp_dir']
                index = s.statsLayers.index(s.layerA)
                s.file = os.path.join(s.temp_dir, "p_val" + str(index) + ".tab")

                # Pre-computed stats only need to look at stats layers after
                # layerA, so set the layerB layers to show that
                s.bLayers = s.statsLayers[index:]

            else:
                # Dynamic stats, so we want layerB to start with the first layer
                s.bLayers = s.statsLayers

    @staticmethod
    def bothDiscreteOnePair(layerA, layerB, layers, hexNames):

        # This handles one attribute pair for ignore-layout stats when both
        # attributes have any combination of binary and categorical values

        # Find the ranges of layer A & B
        # This is silly for binary data, but good for categorical data
        vals = layers[layerB].values()
        bMax = int(max(vals))
        bMin = int(min(vals))

        vals = layers[layerA].values()
        aMax = int(max(vals))
        aMin = int(min(vals))

        # Initialize the contingency table that will contain counts for each
        # combination of values between the two attributes. So for a binary
        # attribute vs. a categorical attribute of 3 possible values, we will
        # have a 2 x 3 contingency table initialized to all zeroes.
        table = [[0 for i in range(bMax - bMin + 1)] \
            for j in range(aMax - aMin + 1)]

        # Loop through all the hexagons incrementing the count in the
        # appropriate contingency table cell. Ignore those hexagons that do not
        # have a value in one or both of the attributes.
        for hexagon in hexNames:

            try:
                aVal = int(layers[layerA][hexagon])
            except KeyError:
                # this means this hexagon has no value in this layer
                continue

            try:
                bVal = int(layers[layerB][hexagon])
            except KeyError:
                continue

            table[aVal - aMin][bVal - bMin] += 1

        # Call the chi-squared function
        try:
            chi2, pValue, dof, expectedFreq = scipy.stats.chi2_contingency(table)
        except Exception:
            # We probably had all zeros for a column in the contingency table.
            # See <http://stats.stackexchange.com/q/73708>. Chi-squared can't be
            # done in this case.
            # http://docs.scipy.org/doc/scipy-0.16.0/reference/generated/scipy.stats.chi2_contingency.html#scipy.stats.chi2_contingency
            chi2 = pValue = dof = expectedFreq = float('NaN')

        return [layerA, layerB, sigDigs(pValue)]

    @staticmethod
    def bothContinuousOnePair(layerA, layerB, layers, hexNames):

        # This handles one attribute pair for ignore-layout stats when
        # both attributes have continuous values.

        # Loop through all the hexagons building a vector for each of the
        # attributes in the pair. If the hexagon has a value in both
        # attributes, add the values to the vectors. Otherwise ignore this
        # hexagon in calculating this attribute-pair statistics.
        A = B = []

        for hexagon in hexNames:
            try:
                aVal = int(layers[layerA][hexagon])
            except KeyError:
                # this means this hexagon has no value in this layer
                continue
            try:
                bVal = int(layers[layerB][hexagon])
            except KeyError:
                continue

            A.append(aVal)
            B.append(bVal)

        # Call the stats library function
        try:
            # Pearson call returns like so:
            #   [Pearsons-correlation-coefficient, 2-tailed-p-value]
            # http://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.pearsonr.html
            correlation, pValue = scipy.stats.pearsonr(layers[layerA].values(),
                layers[layerB].values())
        except Exception:
            correlation = pValue = float('NaN')

        return [layerA, layerB, sigDigs(pValue)]

    @staticmethod
    def oneContinuousOnePair(layerA, layerB, layers, hexNames, layerAtype):

        # This handles one attribute pair for ignore-layout stats when only one
        # of the attributes has continuous values. Binary attributes are treated
        # as if they are categorical with two values.

        # Assign new names to the layers depending on which is continuous
        if layerAtype == 'cont':
            contL = layerA
            catL = layerB
        else:
            contL = layerB
            catL = layerA

        # Build a vector for each category of the categorical attribute.
        # For each hexagon store its continuous value in the category vector to
        # which it belongs. If the hexagon does not have a value in either of
        # the attributes, ignore it.
        vals = {}
        for hexagon in hexNames:
            try:
                catVal = str(int(layers[catL][hexagon]))
            except KeyError:
                # The hexagon has no value in the categorical layer
                continue
            try:
                contVal = layers[contL][hexagon]
            except KeyError:
                # The hexagon has no value in the continuous layer
                continue

            if catVal in vals:
                vals[catVal].append(contVal)
            else:
                vals[catVal] = [contVal]

        lists = vals.values()

        # Call the stats library function
        try:
            # Anova call returns like so: [F-value, p-value-of-F-distribution]
            # http://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.f_oneway.html

            # Create a string to evaluate to make the call because we have
            # a variable number of lists to pass in
            fValue, pValue = eval('scipy.stats.f_oneway(' + str(lists)[1:-1] + ')')
        except Exception:
            fValue = pValue = float('NaN')

        return [layerA, layerB, sigDigs(pValue)]

    @staticmethod
    def layoutIgnore(s, layerB):

        # If layerA is layerB, we want to write a value of nan at the p-value
        # so it will not be included in the sort in visualization
        if s.layerA == layerB:
            return [s.layerA, layerB, float('NaN')]

        # Determine layerB's data type
        types = [s.layerAtype]
        if hasattr(s, 'binLayers') and layerB in s.binLayers:
            types.append('bin')
        elif hasattr(s, 'catLayers') and layerB in s.catLayers:
            types.append('cat')
        elif hasattr(s, 'contLayers') and layerB in s.contLayers:
            types.append('cont')

        else:
            # We should never get here. TODO log an error?
            return 'continue'

        # Call the appropriate stats algorithm based on both layers' data types

        # Is one attribute continuous?
        if types.count('cont') > 0:

            # Are both attributes continuous?
            if types.count('cont') == 2:
                return s.bothContinuousOnePair(s.layerA, layerB, s.layers,
                    s.hexNames)

            # Handle the case where only one attribute is continuous
            else:
                return s.oneContinuousOnePair(s.layerA, layerB, s.layers,
                    s.hexNames, s.layerAtype)

        # Is there any combination of binary and categorical?
        elif types.count('bin') == 2 \
            or types.count('cat') == 2 \
            or (types.count('bin') == 1 and types.count('cat') == 1):
            return s.bothDiscreteOnePair(s.layerA, layerB, s.layers, s.hexNames)

        # We should never get here. TODO log an error?
        return 'continue'

    @staticmethod
    def layoutAware(s, layerB):

        # Initialize the counts for the layers to the additives in C2
        A = copy.copy(s.windowAdditives)
        B = copy.copy(A)

        # Find nodes with an attribute value of one.
        # Nodes are the x,y coordinates of hexagons before squiggling
        for i, nodes in enumerate(s.windowNodes):
            for node in nodes:

                # Does this node have a value of one in layer A or B?
                a = (s.layers[s.layerA].has_key(node)
                    and s.layers[s.layerA][node] == 1)
                b = (s.layers[layerB].has_key(node)
                    and s.layers[layerB][node] == 1)

                # Only increment the count if both a and b are not one,
                # essentially to avoid counting this value twice
                if not (a and b):
                    if a: A[i] += 1
                    if b: B[i] += 1

        # Call the stats library function
        try:
            # Pearson call returns like so:
            #   [Pearsons-correlation-coefficient, 2-tailed-p-value]
            # http://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.pearsonr.html
            correlation, pValue = scipy.stats.pearsonr(A, B)
        except Exception:
            correlation = pValue = float('NaN')

        return [layerB, sigDigs(correlation), sigDigs(pValue)]

    def __call__(s):

        # Open a csv writer for stats of this layer against all other layers,
        # if a filename was provided
        fOut = None
        if hasattr(s, 'file'):
            fOutFile = open(s.file, 'w')
            fOut = csv.writer(fOutFile, delimiter='\t')

        # Compare each layer against the given layer
        response = []
        error = False
        for layerB in s.statsLayers:

            # We don't want to compare a layer to itself for layout-aware stats
            if s.layerA == layerB and hasattr(s, 'windowNodes'): continue

            # Based on layout-aware or not, call a
            # function to compare layers A & B
            if hasattr(s,'windowNodes'):
                line = s.layoutAware(s, layerB)
            else:
                line = s.layoutIgnore(s, layerB)

            if line == 'continue': continue

            # Add the result to either an array or a file
            if fOut is None:

                # Add this line to the response array
                response.append(line)
            else:

                # Write this line to the stats file
                fOut.writerow(line)

        if hasattr(s, 'file'):
            fOutFile.close()
        else:

            # Replace any nan's with a string 'nan' because json doesn't know
            # what to do with those
            for i, line in enumerate(response):
                for j, val in enumerate(line):
                    if is_number(val) and math.isnan(val):
                        response[i][j] = 'nan'

            print json.dumps(response, sort_keys=True)

        return 0

# Class end ###################################################

def dynamicLayoutAwareStats(parm):

    # This handles the creation of parameters specific to layout-aware stats

    # Populate a window node and additives arrays from windows_*.tab
    fname = "windows_" + str(parm['layout']) + ".tab"
    fpath = os.path.join(parm['directory'], fname)
    if not os.path.isfile(fpath):
        print "Error:", fname, "not found, so statistics could not be computed\n"
        return 1;

    windowNodes = []
    windowAdditives = []

    with open(fpath, 'rU') as f:
        f = csv.reader(f, delimiter='\t')
        for i, line in enumerate(f.__iter__()):
            windowNodes.append([])
            for j, val in enumerate(line):
                if j == 0:
                    windowAdditives.append(float(val))
                else:
                     windowNodes[i].append(val)
    parm['windowAdditives'] = windowAdditives
    parm['windowNodes'] = windowNodes

def dynamicIgnoreLayoutStats(parm):

    # Retrieve the hexagon names from the hexNames.tab file
    fpath = os.path.join(parm['directory'], "hexNames.tab")
    if not os.path.isfile(fpath):
        print "Error:", fname, "not found, so statistics could not be computed\n"
        return 1;

    hexNames = []
    with open(fpath, 'rU') as f:
        for i, line in enumerate(f.__iter__()):
            hexNames.append(line[:-1]) # with new-line removed

    parm['hexNames'] = hexNames

def dynamicStats(parm):

    # This handles dynamic stats initiated by the client

    # Adjust the directory from that received from the client
    # TODO where do we get the directory prefix from?
    directory = '../../../../../public/' + parm['directory'][:-1]
    parm['directory'] = directory

    # TODO? Build a layer_names list in the form:
    # [name0, name1, name2...]
    # So it emulates the layer_names built during viz-pre-processing.
    # fill missing array elements with 'none' so the indexes match those of
    # the layer_*.tab file names.

    # Populate the layer to file names dict by pulling the
    # layernames and base layer filenames from layers.tab
    fOut = None
    with open(os.path.join(directory, "layers.tab"), 'rU') as f:
        f = csv.reader(f, delimiter='\t')
        layerFiles = {}
        for i, line in enumerate(f.__iter__()):
            layerFiles[line[0]] = line[1]

    parm['layerFiles'] = layerFiles

    # Populate a minimal layers dict with the layers values from the data files
    layers = {}
    for layerName in parm['statsLayers']:

        if layerName in parm['dynamicData']:

            # This attribute is dynamic with no data file
            # so pull its data from the dynamicData given
            layers[layerName] = parm['dynamicData'][layerName]
        else:

            # Pull the data for this layer from the file
            filename = layerFiles[layerName]
            with open(os.path.join(directory, filename), 'rU') as f:
                f = csv.reader(f, delimiter='\t')
                layers[layerName] = {}
                for i, line in enumerate(f.__iter__()):
                    layers[layerName][line[0]] = float(line[1])
    parm['layers'] = layers

    # Complete populating the parms for layout-aware or layout-ignore
    if 'layout' in parm:
        ret = dynamicLayoutAwareStats(parm)
    else:
        ret = dynamicIgnoreLayoutStats(parm)
    if ret == 1: return 0

    # Create an instance of ForEachLayer and call it
    oneLayer = ForEachLayer(parm)
    oneLayer()

    return 0

if __name__ == "__main__" :
    try:
        # Get the return code to return
        # Don't just exit with it because sys.exit works by exceptions.
        parmWrapper = json.loads(sys.argv[1]);
        return_code = dynamicStats(parmWrapper['parm'])
    except:
        traceback.print_exc()
        # Return a definite number and not some unspecified error code.
        return_code = 1
        
    sys.exit(return_code)
