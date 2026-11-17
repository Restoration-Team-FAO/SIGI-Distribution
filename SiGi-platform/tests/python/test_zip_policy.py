import importlib.util
import pathlib
import unittest
import zipfile

module_path = pathlib.Path(__file__).resolve().parents[2] / 'services' / 'gis-service' / 'app' / 'core' / 'zip_policy.py'
spec = importlib.util.spec_from_file_location('sigi_zip_policy', module_path)
zip_policy = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(zip_policy)


def entry(name: str, size: int = 10, compressed: int = 10, flags: int = 0):
    item = zipfile.ZipInfo(name)
    item.file_size = size
    item.compress_size = compressed
    item.flag_bits = flags
    return item


class ZipPolicyTests(unittest.TestCase):
    def validate(self, entries):
        zip_policy.validate_zip_entries(
            entries,
            max_entries=3,
            max_uncompressed_bytes=100,
            max_compression_ratio=10,
        )

    def test_accepts_a_bounded_archive(self):
        self.validate([entry('shape.shp'), entry('shape.dbf')])

    def test_rejects_entry_count_expansion_ratio_traversal_and_encryption(self):
        cases = [
            [entry(str(index)) for index in range(4)],
            [entry('large.shp', size=101)],
            [entry('bomb.shp', size=100, compressed=1)],
            [entry('../escape.shp')],
            [entry('secret.shp', flags=1)],
        ]
        for entries in cases:
            with self.subTest(entries=entries), self.assertRaises(zip_policy.ZipPolicyError):
                self.validate(entries)


if __name__ == '__main__':
    unittest.main()
