def _install_progress() -> None:
    try:
        from app import progress
        progress.install()
    except Exception:
        pass


_install_progress()
