import importlib.util
import math
from pathlib import Path
import random
import unittest
from unittest.mock import patch

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

    def test_small_range_is_preserved_in_transmitted_measurement(self):
        with patch.dict(module.os.environ, {'ROVERSENSE_SENSOR_KEY': 'test-only-key'}), \
                patch.object(module, 'send_measurement') as send:
            result = module.main(['--url', 'http://localhost', '--count', '1',
                                  '--min', '0.000001', '--max', '0.000002'])
        self.assertEqual(result, 0)
        self.assertTrue(0.000001 <= send.call_args.args[2] <= 0.000002)

    def test_nonfinite_parameters_are_rejected_before_transmission(self):
        with patch.dict(module.os.environ, {'ROVERSENSE_SENSOR_KEY': 'test-only-key'}), \
                patch.object(module, 'send_measurement') as send:
            for extra in [['--min=nan'], ['--max=inf'], ['--interval=nan'],
                          ['--interval=inf'], ['--interval=1e300']]:
                with self.subTest(extra=extra):
                    self.assertEqual(module.main(['--url', 'http://localhost', *extra]), 2)
            send.assert_not_called()

    def test_network_failure_does_not_abort_remaining_samples(self):
        for error in (TimeoutError('test timeout'), ConnectionResetError('test reset')):
            with self.subTest(error=type(error).__name__), \
                    patch.dict(module.os.environ, {'ROVERSENSE_SENSOR_KEY': 'test-only-key'}), \
                    patch.object(module, 'send_measurement', side_effect=[error, None]) as send:
                result = module.main(['--url', 'http://localhost', '--count', '2'])
                self.assertEqual(result, 1)
                self.assertEqual(send.call_count, 2)


if __name__ == '__main__':
    unittest.main()
