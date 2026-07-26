import importlib.util
import sys
from pathlib import Path

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def load_module(relative_path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def arts():
    return load_module("generate_game_arts.py", "generate_game_arts")


def test_create_image_uses_square_canvas_and_background(arts):
    img, draw = arts.create_image((10, 20, 30))

    assert img.size == (arts.SIZE, arts.SIZE)
    assert img.mode == "RGB"
    assert img.getpixel((0, 0)) == (10, 20, 30)
    assert draw is not None


def test_half_is_the_canvas_centre(arts):
    assert arts.HALF * 2 == arts.SIZE


@pytest.mark.parametrize("name", ["mines", "coinflip", "dice", "roulette", "crash"])
def test_each_artwork_paints_over_the_background(arts, name):
    img, draw = arts.create_image((15, 10, 30))
    getattr(arts, f"draw_{name}")(img, draw)

    colours = img.getcolors(maxcolors=arts.SIZE * arts.SIZE)
    assert len(colours) > 1
    assert img.getpixel((arts.HALF, arts.HALF)) != (15, 10, 30)


def test_generate_all_writes_one_png_per_game(arts, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(arts, "OUTPUT_DIR", str(tmp_path))

    arts.generate_all()

    written = sorted(path.name for path in tmp_path.glob("*.png"))
    assert written == ["coinflip.png", "crash.png", "dice.png", "mines.png", "roulette.png"]
    with Image.open(tmp_path / "mines.png") as img:
        assert img.size == (arts.SIZE, arts.SIZE)
        assert img.format == "PNG"
    assert "Generating mines..." in capsys.readouterr().out


def test_generate_all_fails_loudly_without_an_output_dir(arts, tmp_path, monkeypatch):
    monkeypatch.setattr(arts, "OUTPUT_DIR", str(tmp_path / "missing"))

    with pytest.raises(FileNotFoundError):
        arts.generate_all()
