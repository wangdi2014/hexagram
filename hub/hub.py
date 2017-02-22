
import json
from flask import Flask, request, jsonify, current_app
import config
import hubUtil
from hubUtil import SuccessResp, ErrorResp, log
import Nof1_hub

app = Flask(__name__)

# TODO use env vars for this installation-specific config
app.config.from_object('config.DevelopmentSwatConfig')
#app.config.from_object('config.ProductionKolossusConfig')

# TODO: can ctx this be stashed in flask's app.config object?
ctx = {
    'viewDir': '/Users/swat/data/view'
    #'viewDir': '/hive/groups/hexmap/prod/data/view'
}

# Validate a post
def validatePost():
    if request.headers['Content-Type'] != 'application/json':
        raise ErrorResp('Content-Type must be application/json')
    try:
        dataIn = request.get_json()
    except:
        raise ErrorResp('Post content is invalid JSON')
    return dataIn

# Register the success handler
@app.errorhandler(SuccessResp)
def successResponse(success):
    response = jsonify(success.to_dict())
    response.status_code = 200
    log('info', 'response: ' + str(response), current_app)
    return response

# Register the error handler
@app.errorhandler(ErrorResp)
def errorResponse(error):
    response = jsonify(error.to_dict())
    response.status_code = error.status_code
    log('error', 'Request failed with: ' + str(response.status_code) + ': ' + \
        str(response), current_app)
    return response

"""
# Handle file request routes by view file name
@app.route('/file/<string:filename>/<path:map>', methods=['POST', 'GET'])
def queryFile(filename, map):
"""

# Handle query/<operation> routes
@app.route('/query/<string:operation>', methods=['POST'])
def queryRoute(operation):

    log('info', 'Received query operation: ' + operation, current_app)
    dataIn = validatePost()

    if operation == 'overlayNodes':
        Nof1_hub.calc(dataIn, ctx)
        
    else:
        raise ErrorResp('URL not found', 404)

    log('info', 'Success with query operation: ' + operation, current_app)

    raise SuccessResp('Success!')

# Handle the route to test
@app.route('/test', methods=['POST', 'GET'])
def testRoute():

    app.logger.debug('testRoute current_app: ' + str(current_app))

    raise SuccessResp('just testing')


