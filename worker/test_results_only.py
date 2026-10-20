"""Self-check for results_only(): marksheet personal details never survive.

Synthetic data only. Run:  python worker/test_results_only.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_knowledge import results_only  # noqa: E402

SHEET = """CENTRAL BOARD OF SECONDARY EDUCATION
SECONDARY SCHOOL EXAMINATION (YEAR : 2017)
This is to certify that JOHN DOE
Roll No 1234567
Mother's Name JANE DOE Father's/
Guardian's Name
R.K.DOE
Date of Birth 01/02/2003 Registration No. X99887766
School (Code) EXAMPLE PUBLIC SCHOOL CITY (01234)
041 MATHEMATICS B1 A2 A1 10
Enrollment No.
190290010012345
Cumulative Grade Point Average (CGPA): 9.4
FIRST DIVISION WITH DISTINCTION
RESULT: PASS
21/05/2023 20:40:28 IST"""

kept = results_only(SHEET)
for gone in ("1234567", "JANE", "R.K.DOE", "01/02/2003", "X99887766", "190290010012345", "21/05/2023"):
    assert gone not in kept, f"{gone!r} leaked"
for stays in ("SECONDARY SCHOOL EXAMINATION", "041 MATHEMATICS B1 A2 A1 10", "CGPA): 9.4", "FIRST DIVISION WITH DISTINCTION", "RESULT: PASS", "EXAMPLE PUBLIC SCHOOL"):
    assert stays in kept, f"{stays!r} dropped"
print("results_only self-check: all assertions passed")
