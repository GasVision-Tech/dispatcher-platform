#!/usr/bin/env python3

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


def request_json(method: str, url: str, payload: dict | None = None, headers: dict | None = None):
    body = None
    request_headers = {"Content-Type": "application/json"}
    if headers:
        request_headers.update(headers)
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    with urllib.request.urlopen(req, timeout=15) as response:
        return response.status, json.loads(response.read().decode("utf-8"))


def print_ok(message: str):
    print(f"[OK] {message}")


def print_fail(message: str):
    print(f"[FAIL] {message}")


def run(args: argparse.Namespace) -> int:
    try:
        status, health = request_json("GET", f"{args.event_service_url}/health")
        if status != 200 or health.get("status") != "ok":
            print_fail("event-service healthcheck failed")
            return 1
        print_ok("event-service healthcheck passed")

        status, health = request_json("GET", f"{args.bff_url}/health")
        if status != 200 or health.get("status") != "ok":
            print_fail("bff healthcheck failed")
            return 1
        print_ok("bff healthcheck passed")

        _, login_data = request_json(
            "POST",
            f"{args.bff_url}/api/auth/login",
            {"email": args.email, "password": args.password},
        )
        token = login_data.get("access_token")
        if not token:
            print_fail("login did not return access token")
            return 1
        auth_headers = {"Authorization": f"Bearer {token}"}
        print_ok("bff login passed")

        _, user = request_json("GET", f"{args.bff_url}/api/auth/me", headers=auth_headers)
        print_ok(f"authenticated as {user['full_name']}")

        _, stations = request_json("GET", f"{args.bff_url}/api/stations", headers=auth_headers)
        print_ok(f"loaded {len(stations)} stations")

        _, summary = request_json("GET", f"{args.bff_url}/api/dashboard/summary", headers=auth_headers)
        print_ok(
            "dashboard summary loaded "
            f"(events_24h={summary['events_24h']}, stations_total={summary['stations_total']})"
        )

        if args.create_event:
            created_at = datetime.now(timezone.utc).isoformat()
            payload = {
                "source": "cv",
                "title": f"smoke-test event {created_at}",
                "station_code": args.station_code,
                "camera_code": "cam_smoke",
                "severity": "low",
                "status": "open",
                "media": [
                    {
                        "kind": "image",
                        "s3_url": f"s3://debug/smoke/{urllib.parse.quote(created_at)}.jpg",
                    }
                ],
            }
            _, created = request_json("POST", f"{args.event_service_url}/v1/events", payload)
            print_ok(f"created smoke event id={created['id']} on station {created['station_code']}")

        _, events = request_json("GET", f"{args.bff_url}/api/events", headers=auth_headers)
        print_ok(f"loaded {len(events)} events via bff")

        if events:
            event_id = events[0]["id"]
            _, detail = request_json("GET", f"{args.bff_url}/api/events/{event_id}", headers=auth_headers)
            print_ok(f"loaded event detail id={detail['id']}")

        print()
        print("Smoke test finished successfully.")
        return 0

    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print_fail(f"http {exc.code} for {exc.url}")
        print(body)
        return 1
    except Exception as exc:
        print_fail(str(exc))
        return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Smoke test for dispatcher platform")
    parser.add_argument("--event-service-url", default="http://localhost:8000")
    parser.add_argument("--bff-url", default="http://localhost:8010")
    parser.add_argument("--email", default="dispatcher1@gasvision.local")
    parser.add_argument("--password", default="demo123")
    parser.add_argument("--station-code", default="azs_001")
    parser.add_argument("--create-event", action="store_true")
    return parser


if __name__ == "__main__":
    sys.exit(run(build_parser().parse_args()))
