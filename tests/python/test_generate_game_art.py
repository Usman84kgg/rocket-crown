import importlib.util
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'


@pytest.fixture()
def converter(monkeypatch):
    """Load the script with a recording stand-in for the optional cairosvg dep."""
    calls = []

    def svg2png(**kwargs):
        calls.append(kwargs)

    fake = types.ModuleType("cairosvg")
    fake.svg2png = svg2png
    monkeypatch.setitem(sys.modules, "cairosvg", fake)

    spec = importlib.util.spec_from_file_location(
        "generate_game_art", ROOT / "scripts/generate_game_art.py"
    )
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "generate_game_art", module)
    spec.loader.exec_module(module)
    module.calls = calls
    return module


def test_reports_a_missing_asset_directory(converter, tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)

    assert converter.main() == 1
    assert "Directory not found" in capsys.readouterr().err


def test_succeeds_when_there_is_nothing_to_convert(converter, tmp_path, monkeypatch, capsys):
    (tmp_path / "assets/games").mkdir(parents=True)
    monkeypatch.chdir(tmp_path)

    assert converter.main() == 0
    assert "No SVG files found" in capsys.readouterr().out
    assert converter.calls == []


def test_converts_every_svg_to_a_1024_png(converter, tmp_path, monkeypatch, capsys):
    games = tmp_path / "assets/games"
    games.mkdir(parents=True)
    (games / "dice.svg").write_text(SVG)
    (games / "crash.svg").write_text(SVG)
    monkeypatch.chdir(tmp_path)

    assert converter.main() == 0

    assert len(converter.calls) == 2
    assert {Path(call["write_to"]).name for call in converter.calls} == {"dice.png", "crash.png"}
    assert all(call["output_width"] == 1024 and call["output_height"] == 1024 for call in converter.calls)
    assert "Converted: dice.svg -> dice.png" in capsys.readouterr().out


def test_keeps_going_when_one_file_fails(converter, tmp_path, monkeypatch, capsys):
    games = tmp_path / "assets/games"
    games.mkdir(parents=True)
    (games / "broken.svg").write_text(SVG)
    (games / "fine.svg").write_text(SVG)
    monkeypatch.chdir(tmp_path)

    original = converter.svg2png

    def flaky(**kwargs):
        if "broken" in kwargs["url"]:
            raise ValueError("bad svg")
        original(**kwargs)

    monkeypatch.setattr(converter, "svg2png", flaky)

    assert converter.main() == 0

    captured = capsys.readouterr()
    assert "Failed to convert broken.svg: bad svg" in captured.err
    assert "Converted: fine.svg -> fine.png" in captured.out


def test_ignores_non_svg_files(converter, tmp_path, monkeypatch):
    games = tmp_path / "assets/games"
    games.mkdir(parents=True)
    (games / "readme.txt").write_text("nope")
    monkeypatch.chdir(tmp_path)

    assert converter.main() == 0
    assert converter.calls == []
