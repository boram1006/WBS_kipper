from .meeting_analyzer import analyze_meeting_note


def extract_candidates(meeting_note: str, columns: list[str], rows: list[dict[str, str]]) -> list[dict]:
    analysis = analyze_meeting_note("", "", meeting_note, rows)
    return analysis["changes"]
