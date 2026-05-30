from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from api import kmb, ctb
import asyncio

app = Flask(__name__)
CORS(app)

@app.route("/")
def index():
    kmb_response = kmb.request_all_route_list()
    ctb_response = ctb.request_all_route_list()

    combined_route_list = []

    for route in kmb_response.get("data", []):
        combined_route_list.append({
            "company": "KMB",
            "number": route.get("route"),
            # Send both language configurations to the browser
            "dest_en": f"{route.get('orig_en', '')} → {route.get('dest_en', '')}",
            "dest_tc": f"{route.get('orig_tc', '')} → {route.get('dest_tc', '')}",
            "bound": "O"
        })

    for route in ctb_response.get("data", []):
        combined_route_list.append({
            "company": "CTB",
            "number": route.get("route"),
            # Send both language configurations to the browser
            "dest_en": f"{route.get('orig_en', '')} → {route.get('dest_en', '')}",
            "dest_tc": f"{route.get('orig_tc', '')} → {route.get('dest_tc', '')}",
            "bound": route.get("bound", "1")
        })

    return render_template("index.html", route_list=combined_route_list)


@app.route("/route_stop", methods=["GET"])
def request_route_stop():
    company = request.args.get("company", "").lower()
    route = request.args.get("route")
    direction = request.args.get("direction", "O" if company == "kmb" else "outbound")

    if company == "kmb":
        return jsonify(kmb.request_route_stop(route, direction))
    elif company == "ctb":
        return jsonify(ctb.request_route_stop(route, direction))
    return jsonify({"error": "Invalid company"}), 400


@app.route("/route_stop_arrival", methods=["GET"])
def request_route_stop_arrival():
    company = request.args.get("company", "").lower()
    route = request.args.get("route", "").upper()
    direction = request.args.get("direction", "outbound")

    if company == "kmb":
        return jsonify(kmb.request_route_stop_arrival(route))
    elif company == "ctb":
        result = asyncio.run(ctb.request_route_eta_all_async(route, direction))
        return jsonify(result)

    return jsonify({"data": []})

@app.route("/stop", methods=["GET"])
def get_stop():
    company = request.args.get("company", "").lower()
    stop_id = request.args.get("stop")
    
    if company == "kmb" and stop_id:
        return jsonify(kmb.request_stop(stop_id))
    if company == "ctb" and stop_id:
        return jsonify(ctb.request_stop(stop_id))
    return jsonify({"error": "Invalid company or missing stop ID"}), 400

if __name__ == "__main__":
    app.run(debug=False)