from io import BytesIO
from typing import Any

import pandas as pd


ROW_ID_COLUMN = "_row_id"


def parse_wbs(filename: str, content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    stream = BytesIO(content)
    if filename.lower().endswith(".csv"):
        df = pd.read_csv(stream)
    else:
        df = pd.read_excel(stream, engine="openpyxl")

    df = df.fillna("")
    df.columns = [str(column).strip() for column in df.columns]
    if ROW_ID_COLUMN not in df.columns:
        df.insert(0, ROW_ID_COLUMN, [str(index + 1) for index in range(len(df))])

    rows = [{str(key): str(value) for key, value in row.items()} for row in df.to_dict(orient="records")]
    return list(df.columns), rows


def rows_to_csv(columns: list[str], rows: list[dict[str, Any]]) -> str:
    df = pd.DataFrame(rows)
    for column in columns:
        if column not in df.columns:
            df[column] = ""
    return df[columns].to_csv(index=False)


def find_row(rows: list[dict[str, str]], row_id: str) -> dict[str, str] | None:
    normalized = str(row_id)
    for row in rows:
        if str(row.get(ROW_ID_COLUMN, "")) == normalized:
            return row
        for column, value in row.items():
            lowered = column.lower()
            if ("id" in lowered or "wbs" in lowered) and str(value) == normalized:
                return row
    return None
