def _install_progress() -> None:
    try:
        from app import progress
        progress.install()
    except Exception:
        pass
    try:
        from app import router_llm
        router_llm.install()
    except Exception:
        pass
    try:
        from app import chat_routes  # noqa: F401
    except Exception:
        pass


_install_progress()
