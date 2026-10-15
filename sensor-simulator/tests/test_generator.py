"""Testy standardowej biblioteki Python, bez zewnętrznych zależności."""
import importlib.util
import math
from pathlib import Path
import random
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'src' / 'generator.py'
SPEC = importlib.util.spec_from_file_location('roversense_generator', SOURCE)
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class GeneratorTests(unittest.TestCase):
    def test_sine_stays_within_bounds(self):
        rng = random.Random(3)
        values = [module.value_for(i, -40, 60, 'sine', rng) for i in range(100)]
        self.assertTrue(all(-40 <= x <= 60 and math.isfinite(x) for x in values))

    def test_random_is_repeatable_with_seed(self):
        first = module.value_for(5, 0, 1, 'random', random.Random(17))
        second = module.value_for(5, 0, 1, 'random', random.Random(17))
        self.assertEqual(first, second)

    def test_unknown_pattern_is_rejected(self):
        with self.assertRaises(ValueError):
            module.value_for(0, 0, 1, 'invalid', random.Random())


if __name__ == '__main__':
    unittest.main()
