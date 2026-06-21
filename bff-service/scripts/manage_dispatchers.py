import argparse
import secrets
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func

from app.core.security import hash_password
from app.db.models.station import Station
from app.db.models.user import User
from app.db.models.user_station_access import UserStationAccess
from app.db.session import SessionLocal


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage dispatcher users in the BFF database.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="List dispatchers.")
    list_parser.add_argument("--include-inactive", action="store_true")

    create_parser = subparsers.add_parser("create", help="Create a dispatcher.")
    create_parser.add_argument("--email", required=True)
    create_parser.add_argument("--full-name", required=True)
    create_parser.add_argument("--password")
    create_parser.add_argument("--telegram-username")
    _add_station_args(create_parser)

    update_parser = subparsers.add_parser("update", help="Update dispatcher profile fields.")
    update_parser.add_argument("--email", required=True)
    update_parser.add_argument("--new-email")
    update_parser.add_argument("--full-name")
    update_parser.add_argument("--telegram-username")
    update_parser.add_argument("--active", choices=["true", "false"])

    password_parser = subparsers.add_parser("reset-password", help="Reset dispatcher password.")
    password_parser.add_argument("--email", required=True)
    password_parser.add_argument("--password")

    access_parser = subparsers.add_parser("set-access", help="Replace dispatcher station access.")
    access_parser.add_argument("--email", required=True)
    _add_station_args(access_parser)

    add_access_parser = subparsers.add_parser("add-access", help="Add station access.")
    add_access_parser.add_argument("--email", required=True)
    _add_station_args(add_access_parser)

    remove_access_parser = subparsers.add_parser("remove-access", help="Remove station access.")
    remove_access_parser.add_argument("--email", required=True)
    remove_access_parser.add_argument("--station-code", action="append", required=True)

    deactivate_parser = subparsers.add_parser("deactivate", help="Deactivate dispatcher.")
    deactivate_parser.add_argument("--email", required=True)

    args = parser.parse_args()
    db = SessionLocal()
    try:
        if args.command == "list":
            _list_users(db, include_inactive=args.include_inactive)
        elif args.command == "create":
            _create_user(db, args)
        elif args.command == "update":
            _update_user(db, args)
        elif args.command == "reset-password":
            _reset_password(db, args)
        elif args.command == "set-access":
            user = _get_user(db, args.email)
            _replace_access(db, user, _resolve_stations(db, args))
            db.commit()
            _print_user(db, user)
        elif args.command == "add-access":
            user = _get_user(db, args.email)
            _add_access(db, user, _resolve_stations(db, args))
            db.commit()
            _print_user(db, user)
        elif args.command == "remove-access":
            user = _get_user(db, args.email)
            _remove_access(db, user, args.station_code)
            db.commit()
            _print_user(db, user)
        elif args.command == "deactivate":
            user = _get_user(db, args.email)
            user.is_active = False
            db.commit()
            _print_user(db, user)
    finally:
        db.close()


def _add_station_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--station-code", action="append", default=[])
    parser.add_argument("--all-stations", action="store_true")


def _list_users(db, *, include_inactive: bool) -> None:
    query = db.query(User).order_by(User.email.asc())
    if not include_inactive:
        query = query.filter(User.is_active.is_(True))

    users = query.all()
    if not users:
        print("No dispatchers found.")
        return

    for user in users:
        _print_user(db, user)


def _create_user(db, args) -> None:
    existing_user = _find_user(db, args.email)
    if existing_user:
        raise SystemExit(f"Dispatcher already exists: {args.email}")

    password = args.password or secrets.token_urlsafe(14)
    user = User(
        email=args.email,
        full_name=args.full_name,
        telegram_username=args.telegram_username,
        password_hash=hash_password(password),
        is_active=True,
    )
    db.add(user)
    db.flush()

    stations = _resolve_stations(db, args)
    _add_access(db, user, stations)
    db.commit()

    _print_user(db, user)
    if not args.password:
        print(f"Generated password: {password}")


def _update_user(db, args) -> None:
    user = _get_user(db, args.email)

    if args.new_email:
        existing_user = _find_user(db, args.new_email)
        if existing_user and existing_user.id != user.id:
            raise SystemExit(f"Email is already used: {args.new_email}")
        user.email = args.new_email

    if args.full_name:
        user.full_name = args.full_name
    if args.telegram_username is not None:
        user.telegram_username = args.telegram_username or None
    if args.active is not None:
        user.is_active = args.active == "true"

    db.commit()
    _print_user(db, user)


def _reset_password(db, args) -> None:
    user = _get_user(db, args.email)
    password = args.password or secrets.token_urlsafe(14)
    user.password_hash = hash_password(password)
    db.commit()
    _print_user(db, user)
    if not args.password:
        print(f"Generated password: {password}")


def _resolve_stations(db, args) -> list[Station]:
    if args.all_stations:
        stations = db.query(Station).order_by(Station.station_code.asc()).all()
    else:
        if not args.station_code:
            raise SystemExit("Pass --all-stations or at least one --station-code.")
        normalized_codes = [_normalize_station_code(code) for code in args.station_code]
        stations = (
            db.query(Station)
            .filter(func.replace(func.lower(Station.station_code), "-", "_").in_(normalized_codes))
            .order_by(Station.station_code.asc())
            .all()
        )

    if not stations:
        raise SystemExit("No stations found for requested access.")

    found_codes = {_normalize_station_code(station.station_code) for station in stations}
    requested_codes = {_normalize_station_code(code) for code in args.station_code}
    missing_codes = requested_codes - found_codes
    if missing_codes and not args.all_stations:
        raise SystemExit("Stations not found: " + ", ".join(sorted(missing_codes)))

    return stations


def _add_access(db, user: User, stations: list[Station]) -> None:
    existing_station_ids = {
        row.station_id
        for row in db.query(UserStationAccess).filter(UserStationAccess.user_id == user.id).all()
    }
    for station in stations:
        if station.id not in existing_station_ids:
            db.add(UserStationAccess(user_id=user.id, station_id=station.id))


def _replace_access(db, user: User, stations: list[Station]) -> None:
    db.query(UserStationAccess).filter(UserStationAccess.user_id == user.id).delete()
    db.flush()
    _add_access(db, user, stations)


def _remove_access(db, user: User, station_codes: list[str]) -> None:
    stations = _resolve_stations(
        db,
        argparse.Namespace(all_stations=False, station_code=station_codes),
    )
    station_ids = [station.id for station in stations]
    db.query(UserStationAccess).filter(
        UserStationAccess.user_id == user.id,
        UserStationAccess.station_id.in_(station_ids),
    ).delete(synchronize_session=False)


def _print_user(db, user: User) -> None:
    station_codes = [
        row.station.station_code
        for row in db.query(UserStationAccess)
        .filter(UserStationAccess.user_id == user.id)
        .join(Station)
        .order_by(Station.station_code.asc())
        .all()
    ]
    active = "active" if user.is_active else "inactive"
    stations = ", ".join(station_codes) if station_codes else "-"
    print(f"{user.id}: {user.full_name} <{user.email}> [{active}] stations: {stations}")


def _get_user(db, email: str) -> User:
    user = _find_user(db, email)
    if not user:
        raise SystemExit(f"Dispatcher not found: {email}")
    return user


def _find_user(db, email: str) -> User | None:
    return db.query(User).filter(func.lower(User.email) == email.lower()).one_or_none()


def _normalize_station_code(station_code: str) -> str:
    return station_code.lower().replace("-", "_")


if __name__ == "__main__":
    main()
