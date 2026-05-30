import requests
import aiohttp
import asyncio
class kmb:
    url = "https://data.etabus.gov.hk/v1/transport/kmb/"

    @classmethod
    def request_all_route_list(cls):
        response = requests.get(cls.url + "route/")
        if response.status_code == 200:
            data = response.json()
            # Only outbound by default
            outbound = [r for r in data.get("data", []) if r.get("bound") == "O"]
            data["data"] = outbound
            return data
        return {"data": []}

    @classmethod
    def request_route_stop(cls, route, direction="O", service_type="1"):
        dir_map = {"O": "outbound", "I": "inbound"}
        d = dir_map.get(direction, direction)
        for attempt in [d, direction]:
            resp = requests.get(f"{cls.url}route-stop/{route}/{attempt}/{service_type}")
            if resp.status_code == 200 and resp.json().get("data"):
                return resp.json()
        return {"data": []}

    @classmethod
    def request_route_stop_arrival(cls, route, service_type="1"):
        """Fixed: KMB ETA endpoint returns data under 'data' with 'eta' and 'stop'"""
        resp = requests.get(f"{cls.url}route-eta/{route}/{service_type}")
        if resp.status_code == 200:
            return resp.json()  # Keep original structure
        return {"data": []}

    @classmethod
    def request_stop(cls, stop_id):
        resp = requests.get(f"{cls.url}stop/{stop_id}")
        return resp.json() if resp.status_code == 200 else {"data": {}}


class ctb:
    url = "https://rt.data.gov.hk/v2/transport/citybus/"

    @classmethod
    def request_all_route_list(cls):
        response = requests.get(cls.url + "route/CTB")
        return response.json() if response.status_code == 200 else {"data": []}

    @classmethod
    def request_stop(cls, stop_id):
        resp = requests.get(f"{cls.url}stop/{stop_id}")
        return resp.json() if resp.status_code == 200 else {"data": {}}

    @classmethod
    def request_route_stop(cls, route, direction="outbound"):
        resp = requests.get(f"{cls.url}route-stop/CTB/{route}/{direction}")
        if resp.status_code == 200 and resp.json().get("data"):
            return resp.json()
        return {"data": []}

    @classmethod
    async def request_route_eta_all_async(cls, route, direction="outbound"):
        stops_data = cls.request_route_stop(route, direction)
        stops = stops_data.get("data", [])
        
        # THE FIX: Map "outbound" -> "O" and "inbound" -> "I" to match Citybus API payloads
        dir_map = {"outbound": "O", "inbound": "I", "O": "O", "I": "I"}
        dir_code = dir_map.get(str(direction).lower(), "O")
        
        if not stops:
            return {"data": []}

        async with aiohttp.ClientSession() as session:
            tasks = []
            for stop in stops:
                stop_id = stop.get("stop")
                if stop_id:
                    url = f"{cls.url}eta/CTB/{stop_id}/{route}"
                    tasks.append(cls._fetch_eta(session, url, stop_id, dir_code))

            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            all_etas = []
            for res in results:
                if isinstance(res, list):
                    all_etas.extend(res)
                    
            return {"data": all_etas}

    @staticmethod
    async def _fetch_eta(session, url, stop_id, dir_code):
        try:
            async with session.get(url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    valid_etas = []
                    
                    for item in data.get("data", []):
                        # This will now successfully match "O" == "O" or "I" == "I"
                        if item.get("dir") == dir_code:
                            item["stop"] = stop_id
                            valid_etas.append(item)
                            
                    return valid_etas
        except:
            pass
        return []