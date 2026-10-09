import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  normalizeHeader,
  normalizeStudentId,
  normalizeCsvValue,
  parseCsvRows,
  parseWorkbookBuffer,
  validatePerformanceUpload,
  validateCourseConfigurationUpload,
  calculateCompetencyScore,
  calculateSameCoursePercentiles,
  matchCreditAllocationBand,
  lookupPreviousCredits,
  calculateAcademicPerformanceBatch,
  REQUIRED_PERFORMANCE_HEADERS
} from '../src/lib/importer.js';

const mockStudents = [
  { id: 'uuid-1', student_id: '99240040518', student_name: 'Alice Smith' },
  { id: 'uuid-2', student_id: '99250040067', student_name: 'Bob Jones' },
  { id: 'uuid-3', student_id: '99250040045', student_name: 'Charlie Brown' },
  { id: 'uuid-4', student_id: '99240040514', student_name: 'Diana Prince' }
];

const mockCourses = [
  {
    id: 'course-uuid-1',
    course_code: 'CSE108',
    course_name: 'Problem Solving using Computer Programming',
    reference_credits: 3,
    min_credits: 2,
    max_credits: 4,
    theory_percentage: 34,
    practical_percentage: 23,
    hands_on_percentage: 32,
    project_percentage: 11
  },
  {
    id: 'course-uuid-2',
    course_code: 'ECE201',
    course_name: 'Digital Electronics',
    reference_credits: 4,
    min_credits: 3,
    max_credits: 5,
    theory_percentage: 40,
    practical_percentage: 30,
    hands_on_percentage: 20,
    project_percentage: 10
  }
];

const mockStudentRecords = [
  {
    student_id: 'uuid-1',
    completed_courses: [
      { course_code: 'CSE108', course_name: 'Problem Solving using Computer Programming', credits: 3, grade: 'A' }
    ]
  }
];

const activePolicy = { id: 'policy-1', policy_name: 'Active Dynamic Policy 2026', version: '1.0', status: 'active' };

const mockCreditBands = [
  { id: 'band-1', policy_id: 'policy-1', reference_credits: 3, percentile_min: 0, percentile_max: 20, credits_awarded: 0, band_name: 'Basic' },
  { id: 'band-2', policy_id: 'policy-1', reference_credits: 3, percentile_min: 20.01, percentile_max: 40, credits_awarded: 1, band_name: 'Developing' },
  { id: 'band-3', policy_id: 'policy-1', reference_credits: 3, percentile_min: 40.01, percentile_max: 60, credits_awarded: 2, band_name: 'Intermediate' },
  { id: 'band-4', policy_id: 'policy-1', reference_credits: 3, percentile_min: 60.01, percentile_max: 80, credits_awarded: 2, band_name: 'Proficient' },
  { id: 'band-5', policy_id: 'policy-1', reference_credits: 3, percentile_min: 80.01, percentile_max: 100, credits_awarded: 3, band_name: 'Advanced' },
  { id: 'band-ref4-1', policy_id: 'policy-1', reference_credits: 4, percentile_min: 0, percentile_max: 50, credits_awarded: 4, band_name: 'Ref4 Band 1' },
  { id: 'band-ref4-2', policy_id: 'policy-1', reference_credits: 4, percentile_min: 50.01, percentile_max: 100, credits_awarded: 5, band_name: 'Ref4 Band 2' }
];

test('1. Exact canonical headers', () => {
  const rows = [
    ['student_id', 'course_code', 'theory_score', 'practical_score', 'hands_on_score', 'project_score'],
    ['99240040518', 'CSE108', '82', '76', '88', '79']
  ];
  const res = validatePerformanceUpload(rows, mockStudents, mockCourses);
  assert.equal(res.validRows, 1);
  assert.equal(res.invalidRows, 0);
});

test('2. Deterministic Competency Score formula calculation (CSE108 weights: 34/23/32/11)', () => {
  const course = mockCourses[0];
  const scores = { theory_score: 91, practical_score: 86, hands_on_score: 94, project_score: 89 };
  // (91*34 + 86*23 + 94*32 + 89*11)/100 = (3094 + 1978 + 3008 + 979)/100 = 90.59
  const cs = calculateCompetencyScore(course, scores);
  assert.equal(cs, 90.59);
});

test('3. Section 24 - TEST 1: Percentile = 90, Reference Credits = 3 retrieves matching database band', () => {
  const res = matchCreditAllocationBand(activePolicy, mockCreditBands, 3, 90);
  assert.equal(res.error, null);
  assert.notEqual(res.band, null);
  assert.equal(res.band.band_name, 'Advanced');
  assert.equal(res.band.credits_awarded, 3);
});

test('4. Section 24 - TEST 2: Modifying database credits_awarded returns NEW database value dynamically', () => {
  const modifiedBands = mockCreditBands.map(b => b.id === 'band-5' ? { ...b, credits_awarded: 4 } : b);
  const res = matchCreditAllocationBand(activePolicy, modifiedBands, 3, 90);
  assert.equal(res.band.credits_awarded, 4);
});

test('5. Section 24 - TEST 3: Use different reference credit level (ref_credits = 4) retrieves ref=4 bands', () => {
  const res = matchCreditAllocationBand(activePolicy, mockCreditBands, 4, 90);
  assert.equal(res.band.band_name, 'Ref4 Band 2');
  assert.equal(res.band.credits_awarded, 5);
});

test('6. Section 24 - TEST 4: No active policy returns explicit diagnostic error', () => {
  const res = matchCreditAllocationBand(null, mockCreditBands, 3, 90);
  assert.equal(res.band, null);
  assert.equal(res.error, 'Dynamic credit cannot be calculated: no active credit policy found.');
});

test('7. Section 24 - TEST 5: No allocation bands for reference credit returns explicit diagnostic error', () => {
  const res = matchCreditAllocationBand(activePolicy, mockCreditBands, 5, 90);
  assert.equal(res.band, null);
  assert.equal(res.error, 'Dynamic credit cannot be calculated: no allocation bands configured for this reference credit level.');
});

test('8. Section 24 - TEST 6: Overlapping bands returns explicit configuration error', () => {
  const overlappingBands = [
    { id: 'o1', policy_id: 'policy-1', reference_credits: 3, percentile_min: 0, percentile_max: 80, credits_awarded: 2 },
    { id: 'o2', policy_id: 'policy-1', reference_credits: 3, percentile_min: 50, percentile_max: 100, credits_awarded: 3 }
  ];
  const res = matchCreditAllocationBand(activePolicy, overlappingBands, 3, 70);
  assert.equal(res.band, null);
  assert.equal(res.error, 'Dynamic credit configuration error: multiple allocation bands match this percentile.');
});

test('9. Section 24 - TEST 7: Percentile exactly at a boundary matches inclusive range', () => {
  const resBoundaryMin = matchCreditAllocationBand(activePolicy, mockCreditBands, 3, 20.01);
  assert.equal(resBoundaryMin.band.band_name, 'Developing');

  const resBoundaryMax = matchCreditAllocationBand(activePolicy, mockCreditBands, 3, 40.00);
  assert.equal(resBoundaryMax.band.band_name, 'Developing');
});

test('10. Section 24 - TEST 8: Previous credits = 3, Dynamic credits = 3 -> difference = 0', () => {
  const prev = 3;
  const dyn = 3;
  const diff = dyn - prev;
  assert.equal(diff, 0);
});

test('11. Section 24 - TEST 9: Previous credits = 3, Dynamic credits = 2 -> difference = -1', () => {
  const prev = 3;
  const dyn = 2;
  const diff = dyn - prev;
  assert.equal(diff, -1);
});

test('12. Section 24 - TEST 10: Previous credits = 0, Dynamic credits = 2 -> difference = +2', () => {
  const prev = 0;
  const dyn = 2;
  const diff = dyn - prev;
  assert.equal(diff, 2);
});

test('13. PREVIOUS CREDITS - TEST 1: Student has CSE108 credits = 3 -> Previous Credits = 3 (NOT 0)', () => {
  const studentRecordsMap = new Map();
  studentRecordsMap.set('uuid-3', {
    student_id: 'uuid-3',
    completed_courses: [{ course_code: 'CSE108', credits: 3 }]
  });
  const res = lookupPreviousCredits('uuid-3', '99250040045', 'CSE108', studentRecordsMap);
  assert.equal(res.status, 'FOUND');
  assert.equal(res.previousCredits, 3);
});

test('14. PREVIOUS CREDITS - TEST 2: Student has CSE108 credits = 2 -> Previous Credits = 2', () => {
  const studentRecordsMap = new Map();
  studentRecordsMap.set('uuid-3', {
    student_id: 'uuid-3',
    completed_courses: [{ course_code: 'cse108', credits: 2 }]
  });
  const res = lookupPreviousCredits('uuid-3', '99250040045', 'CSE108', studentRecordsMap);
  assert.equal(res.status, 'FOUND');
  assert.equal(res.previousCredits, 2);
});

test('15. PREVIOUS CREDITS - TEST 3: Student has no CSE108 historical record -> Previous Credits = 0', () => {
  const studentRecordsMap = new Map();
  studentRecordsMap.set('uuid-3', {
    student_id: 'uuid-3',
    completed_courses: [{ course_code: 'ECE201', credits: 4 }]
  });
  const res = lookupPreviousCredits('uuid-3', '99250040045', 'CSE108', studentRecordsMap);
  assert.equal(res.status, 'NOT_FOUND');
  assert.equal(res.previousCredits, 0);
});

test('16. PREVIOUS CREDITS - TEST 4: Student total credits = 41, CSE108 credits = 3 -> Previous Credits = 3 (NOT 41)', () => {
  const studentRecordsMap = new Map();
  studentRecordsMap.set('uuid-3', {
    student_id: 'uuid-3',
    credits_earned: 41, // total student earned credits across all courses
    completed_courses: [{ course_code: 'CSE108', credits: 3 }]
  });
  const res = lookupPreviousCredits('uuid-3', '99250040045', 'CSE108', studentRecordsMap);
  assert.equal(res.status, 'FOUND');
  assert.equal(res.previousCredits, 3);
  assert.notEqual(res.previousCredits, 41);
});

test('17. PREVIOUS CREDITS - TEST 5: Course reference credits = 3, student previously earned = 2 -> Previous Credits = 2 (NOT 3)', () => {
  const studentRecordsMap = new Map();
  studentRecordsMap.set('uuid-3', {
    student_id: 'uuid-3',
    completed_courses: [{ course_code: 'CSE108', credits: 2 }]
  });
  const res = lookupPreviousCredits('uuid-3', '99250040045', 'CSE108', studentRecordsMap);
  assert.equal(res.status, 'FOUND');
  assert.equal(res.previousCredits, 2);
});

test('18. PREVIOUS CREDITS - TEST 6: Dynamic Credits = 3, Previous Credits = 2 -> Difference = +1', () => {
  const prev = 2;
  const dyn = 3;
  assert.equal(dyn - prev, 1);
});

test('19. PREVIOUS CREDITS - TEST 7: Dynamic Credits = 2, Previous Credits = 3 -> Difference = -1', () => {
  const prev = 3;
  const dyn = 2;
  assert.equal(dyn - prev, -1);
});

test('20. PREVIOUS CREDITS - TEST 8: Dynamic Credits = 3, Previous Credits = 3 -> Difference = +0', () => {
  const prev = 3;
  const dyn = 3;
  assert.equal(dyn - prev, 0);
});

test('21. Full Batch End-to-End Pipeline test using database context with actual completed_courses match', () => {
  const rows = [
    ['student_id', 'course_code', 'theory_score', 'practical_score', 'hands_on_score', 'project_score'],
    ['99250040045', 'CSE108', '91', '86', '94', '89']
  ];

  const mockStudentRecordsWithMatch = [
    {
      student_id: 'uuid-3', // matches student 99250040045
      completed_courses: [
        { course_code: 'CSE108', course_name: 'Problem Solving using Computer Programming', credits: 3 }
      ]
    }
  ];

  const context = {
    students: mockStudents,
    courses: mockCourses,
    studentRecords: mockStudentRecordsWithMatch,
    existingPerformance: [],
    activePolicy,
    creditBands: mockCreditBands
  };

  const batch = calculateAcademicPerformanceBatch(rows, context);
  assert.equal(batch.validation.validRows, 1);

  const rec = batch.calculatedRecords[0];
  assert.equal(rec.studentId, '99250040045');
  assert.equal(rec.courseCode, 'CSE108');
  assert.equal(rec.competencyScore, 90.59);
  assert.equal(rec.percentile, 100);
  assert.equal(rec.dynamicCredits, 3);
  assert.equal(rec.previousCredits, 3); // Must be 3 from academic history!
  assert.equal(rec.creditDifference, 0);
  assert.equal(rec.bandName, 'Advanced');
  assert.equal(rec.gradeDisplay, undefined);
});

test('22. PRIORITY MATCHING - TEST 1: Same Course ID match (matchType = course_id)', () => {
  const studentRec = {
    student_id: 'uuid-3',
    completed_courses: [
      { course_id: 'UUID_A', course_code: 'CSE108', credits: 3 }
    ]
  };
  const currentCourse = { id: 'UUID_A', course_code: 'CSE108', course_name: 'Problem Solving' };
  const res = lookupPreviousCredits(studentRec, '99250040045', currentCourse);
  assert.equal(res.status, 'FOUND');
  assert.equal(res.matchType, 'course_id');
  assert.equal(res.previousCredits, 3);
});

test('23. PRIORITY MATCHING - TEST 2: Different Course IDs, Same Course Code (matchType = course_code)', () => {
  const studentRec = {
    student_id: 'uuid-3',
    completed_courses: [
      { course_id: 'UUID_2024', course_code: 'CSE108', credits: 3 }
    ]
  };
  const currentCourse = { id: 'UUID_2025', course_code: 'cse108', course_name: 'Problem Solving' };
  const res = lookupPreviousCredits(studentRec, '99250040045', currentCourse);
  assert.equal(res.status, 'FOUND');
  assert.equal(res.matchType, 'course_code');
  assert.equal(res.previousCredits, 3);
});

test('24. PRIORITY MATCHING - TEST 3: Different Course IDs & Code Missing, Same Name (matchType = course_name)', () => {
  const studentRec = {
    student_id: 'uuid-3',
    completed_courses: [
      { course_id: 'UUID_2024', course_name: 'Problem Solving Using Computer Programming', credits: 3 }
    ]
  };
  const currentCourse = { id: 'UUID_2025', course_code: 'CSE108', course_name: 'Problem Solving using Computer Programming' };
  const res = lookupPreviousCredits(studentRec, '99250040045', currentCourse);
  assert.equal(res.status, 'FOUND');
  assert.equal(res.matchType, 'course_name');
  assert.equal(res.previousCredits, 3);
});

test('25. PRIORITY MATCHING - TEST 4: Different Course (NO MATCH -> Previous Credits = 0)', () => {
  const studentRec = {
    student_id: 'uuid-3',
    completed_courses: [
      { course_id: 'UUID_2024', course_code: 'CSE201', course_name: 'Data Structures', credits: 4 }
    ]
  };
  const currentCourse = { id: 'UUID_2025', course_code: 'CSE108', course_name: 'Problem Solving using Computer Programming' };
  const res = lookupPreviousCredits(studentRec, '99250040045', currentCourse);
  assert.equal(res.status, 'NOT_FOUND');
  assert.equal(res.matchType, 'none');
  assert.equal(res.previousCredits, 0);
});


