import * as XLSX from 'xlsx';

/**
 * Normalizes a CSV/XLSX header string:
 * 1. Converts to string.
 * 2. Removes UTF-8 BOM (\uFEFF) and zero-width/invisible Unicode characters.
 * 3. Trims leading and trailing whitespace.
 * 4. Collapses multiple spaces / non-breaking spaces into single spaces.
 * 5. Converts to lowercase.
 * 6. Preserves underscores.
 */
export function normalizeHeader(header) {
  if (header === null || header === undefined) return '';
  let str = String(header);
  str = str.replace(/[\uFEFF\u200B-\u200D\u200E\u200F\u202A-\u202E\u0000-\u001F]/g, '');
  str = str.trim();
  str = str.replace(/[\s\u00A0]+/g, ' ');
  str = str.toLowerCase();
  return str;
}

/**
 * Normalizes a student ID string preserving digits and stripping whitespace/BOM/trailing .0.
 */
export function normalizeStudentId(val) {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  str = str.replace(/[\uFEFF\u200B-\u200D\u200E\u200F\u202A-\u202E\u0000-\u001F]/g, '');
  if (/^\d+\.0+$/.test(str)) {
    str = str.replace(/\.0+$/, '');
  }
  return str;
}

/**
 * Normalizes general cell value strings by stripping BOM and invisible characters.
 */
export function normalizeCsvValue(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  str = str.replace(/[\uFEFF\u200B-\u200D\u200E\u200F\u202A-\u202E]/g, '');
  return str.trim();
}

/**
 * Parses raw CSV string into 2D row array.
 */
export function parseCsvRows(csvText) {
  if (!csvText) return [];
  let cleanText = csvText.replace(/^\uFEFF/, '');
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;
  for (let index = 0; index < cleanText.length; index += 1) {
    const char = cleanText[index];
    const next = cleanText[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      if (row.some((cell) => cell !== '')) {
        rows.push(row);
      }
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell !== '')) rows.push(row);
  }
  return rows;
}

/**
 * Parses a binary ArrayBuffer of an XLSX/XLS workbook into a 2D row array.
 */
export function parseWorkbookBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellText: false, raw: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
  return rawRows.filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== ''));
}

/**
 * Reads a File object (CSV or XLSX) and returns parsed 2D row array.
 */
export async function parseUploadFile(file) {
  if (!file) return [];
  const fileName = file.name || '';
  const isExcel = fileName.toLowerCase().endsWith('.xlsx') ||
                  fileName.toLowerCase().endsWith('.xls') ||
                  (file.type && (file.type.includes('spreadsheet') || file.type.includes('excel')));

  if (isExcel) {
    const buffer = await file.arrayBuffer();
    return parseWorkbookBuffer(buffer);
  } else {
    const text = await file.text();
    return parseCsvRows(text);
  }
}

export const REQUIRED_PERFORMANCE_HEADERS = [
  'student_id',
  'course_code',
  'theory_score',
  'practical_score',
  'hands_on_score',
  'project_score'
];

/**
 * Deterministically calculates competency score from course component weights.
 * Formula: CS = (Theory * TheoryWeight + Practical * PracticalWeight + HandsOn * HandsOnWeight + Project * ProjectWeight) / 100
 */
export function calculateCompetencyScore(course, scores) {
  if (!course || !scores) return 0;
  const theory = Number(scores.theory_score ?? scores.theory ?? 0);
  const practical = Number(scores.practical_score ?? scores.practical ?? 0);
  const handsOn = Number(scores.hands_on_score ?? scores.handsOn ?? 0);
  const project = Number(scores.project_score ?? scores.project ?? 0);

  const wTheory = Number(course.theory_percentage ?? 25);
  const wPractical = Number(course.practical_percentage ?? 25);
  const wHandsOn = Number(course.hands_on_percentage ?? 25);
  const wProject = Number(course.project_percentage ?? 25);

  const rawScore = (theory * wTheory + practical * wPractical + handsOn * wHandsOn + project * wProject) / 100;
  return Math.round(rawScore * 100) / 100;
}

/**
 * Calculates percentile rankings WITHIN THE SAME COURSE COHORT using the SQL percent_rank() standard algorithm.
 */
export function calculateSameCoursePercentiles(cohortItems) {
  const sorted = [...cohortItems].sort((a, b) => a.competency_score - b.competency_score);
  const N = sorted.length;
  const resultMap = new Map();

  if (N <= 1) {
    sorted.forEach((item) => {
      resultMap.set(item.id, { percentile: 100.0, rank: 1, cohortCount: N });
    });
    return resultMap;
  }

  sorted.forEach((item, index) => {
    const percentRank = (index / (N - 1)) * 100;
    const percentile = Math.round(percentRank * 100) / 100;
    resultMap.set(item.id, { percentile, rank: index + 1, cohortCount: N });
  });

  return resultMap;
}

/**
 * Matches percentile to credit allocation band in public.credit_allocation_bands.
 * Strictly checks active policy, reference credits, and boundary rules with zero hardcoding.
 */
export function matchCreditAllocationBand(activePolicy, bands, referenceCredits, percentile) {
  if (!activePolicy) {
    return {
      band: null,
      error: 'Dynamic credit cannot be calculated: no active credit policy found.'
    };
  }

  const refNum = Number(referenceCredits);
  const percNum = Number(percentile);

  const matchingRefBands = (bands ?? []).filter(
    (b) => String(b.policy_id) === String(activePolicy.id) && Number(b.reference_credits) === refNum
  );

  if (!matchingRefBands.length) {
    return {
      band: null,
      error: 'Dynamic credit cannot be calculated: no allocation bands configured for this reference credit level.'
    };
  }

  const matchedBands = matchingRefBands.filter(
    (b) => percNum >= Number(b.percentile_min) && percNum <= Number(b.percentile_max)
  );

  if (matchedBands.length === 0) {
    return {
      band: null,
      error: 'Dynamic credit cannot be calculated: percentile does not match any configured allocation band.'
    };
  }

  if (matchedBands.length > 1) {
    return {
      band: null,
      error: 'Dynamic credit configuration error: multiple allocation bands match this percentile.'
    };
  }

  return {
    band: matchedBands[0],
    error: null
  };
}

/**
 * Helper to normalize course code for comparison
 */
export function normalizeCourseCode(val) {
  return String(val || '').trim().toUpperCase();
}

/**
 * Helper to normalize course name for comparison (collapsing whitespace and lowercasing)
 */
export function normalizeCourseName(val) {
  return String(val || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Looks up student's actual previously obtained/earned credits for a specific course from student_records.completed_courses.
 * Uses priority matching:
 * STEP 1: exact course_id match
 * STEP 2: normalized course_code match
 * STEP 3: normalized course_name match
 *
 * Supports receiving a studentRecord object, a Map, or positional parameters.
 */
export function lookupPreviousCredits(studentIdOrRecord, studentRegId, courseTarget, optionalMap) {
  let studentRecord = studentIdOrRecord;
  let targetCourseObj = typeof courseTarget === 'object' && courseTarget !== null ? courseTarget : null;
  let targetCourseCode = typeof courseTarget === 'string' ? courseTarget : (targetCourseObj?.course_code || targetCourseObj?.code || '');
  let targetCourseName = targetCourseObj?.course_name || targetCourseObj?.name || '';
  let targetCourseId = targetCourseObj?.id || targetCourseObj?.course_id || '';

  if (studentIdOrRecord instanceof Map || optionalMap instanceof Map) {
    const mapToUse = studentIdOrRecord instanceof Map ? studentIdOrRecord : optionalMap;
    const lookupCode = typeof studentIdOrRecord === 'string' ? studentIdOrRecord : studentRegId;
    studentRecord = mapToUse.get(String(lookupCode).trim()) || (studentRegId ? mapToUse.get(String(studentRegId).trim()) : undefined);
  } else if (typeof studentIdOrRecord === 'string' && !optionalMap) {
    // If called with signature (studentRec, courseCodeOrObj)
    if (typeof studentRegId === 'object' && studentRegId !== null) {
      targetCourseObj = studentRegId;
      targetCourseCode = targetCourseObj.course_code || targetCourseObj.code || '';
      targetCourseName = targetCourseObj.course_name || targetCourseObj.name || '';
      targetCourseId = targetCourseObj.id || targetCourseObj.course_id || '';
    } else if (typeof studentRegId === 'string') {
      targetCourseCode = studentRegId;
    }
    studentRecord = typeof studentIdOrRecord === 'object' ? studentIdOrRecord : undefined;
  }

  if (studentRecord === undefined) {
    return {
      previousCredits: null,
      isCompleted: false,
      status: 'UNAVAILABLE',
      matchType: 'none',
      previousCourseId: null,
      detail: 'Academic history record unavailable'
    };
  }

  const completed = Array.isArray(studentRecord?.completed_courses) ? studentRecord.completed_courses : [];
  const normCurrentCode = normalizeCourseCode(targetCourseCode);
  const normCurrentName = normalizeCourseName(targetCourseName);
  const currentIdStr = targetCourseId ? String(targetCourseId).trim() : null;

  let matchedRecord = null;
  let matchType = 'none';

  // STEP 1: course_id exact match
  if (currentIdStr) {
    matchedRecord = completed.find((c) => {
      const histId = c.course_id || c.id;
      return histId && String(histId).trim() === currentIdStr;
    });
    if (matchedRecord) {
      matchType = 'course_id';
    }
  }

  // STEP 2: normalized course_code exact match (if not matched by course_id)
  if (!matchedRecord && normCurrentCode) {
    matchedRecord = completed.find((c) => {
      const histCode = normalizeCourseCode(c.course_code || c.code);
      return histCode && histCode === normCurrentCode;
    });
    if (matchedRecord) {
      matchType = 'course_code';
    }
  }

  // STEP 3: normalized course_name exact match (if not matched by course_id or course_code)
  if (!matchedRecord && normCurrentName) {
    matchedRecord = completed.find((c) => {
      const histName = normalizeCourseName(c.course_name || c.name);
      return histName && histName === normCurrentName;
    });
    if (matchedRecord) {
      matchType = 'course_name';
    }
  }

  if (matchedRecord) {
    const creditVal = matchedRecord.credits !== undefined && matchedRecord.credits !== null ? matchedRecord.credits : matchedRecord.credits_earned;
    if (creditVal !== undefined && creditVal !== null && !isNaN(Number(creditVal))) {
      return {
        previousCredits: Number(creditVal),
        isCompleted: true,
        status: 'FOUND',
        matchType,
        previousCourseId: matchedRecord.course_id || matchedRecord.id || null,
        detail: `Completed course record found via ${matchType} (${matchedRecord.course_code || matchedRecord.course_name || normCurrentCode})`
      };
    }
  }

  return {
    previousCredits: 0,
    isCompleted: false,
    status: 'NOT_FOUND',
    matchType: 'none',
    previousCourseId: null,
    detail: 'No previous completed course record found'
  };
}

export function validatePerformanceUpload(rows, availableStudents, availableCourses) {
  if (!rows || !rows.length) {
    return {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      warnings: [],
      errors: [{ row: 1, course: '—', field: 'headers', problem: 'The uploaded file is empty.', expected: REQUIRED_PERFORMANCE_HEADERS.join(', ') }],
      preview: []
    };
  }

  const rawHeaders = rows[0]?.map((cell) => normalizeCsvValue(cell)) ?? [];
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  const missingHeaders = REQUIRED_PERFORMANCE_HEADERS.filter((key) => !normalizedHeaders.includes(key));
  const unexpectedHeaders = normalizedHeaders.filter((key) => key && !REQUIRED_PERFORMANCE_HEADERS.includes(key));

  if (missingHeaders.length > 0) {
    return {
      totalRows: Math.max(rows.length - 1, 0),
      validRows: 0,
      invalidRows: Math.max(rows.length - 1, 0),
      warnings: [],
      errors: [{
        row: 1,
        course: '—',
        field: 'headers',
        problem: `Missing required headers: ${missingHeaders.join(', ')}`,
        expected: REQUIRED_PERFORMANCE_HEADERS.join(', '),
        detectedHeaders: rawHeaders,
        normalizedHeaders,
        missingHeaders,
        unexpectedHeaders
      }],
      preview: []
    };
  }

  const byIndex = Object.fromEntries(
    REQUIRED_PERFORMANCE_HEADERS.map((header) => [header, normalizedHeaders.indexOf(header)])
  );

  const studentMap = new Map(
    (availableStudents ?? []).map((student) => [normalizeStudentId(student.student_id), student])
  );
  const courseMap = new Map(
    (availableCourses ?? []).map((course) => [String(course.course_code).trim().toUpperCase(), course])
  );

  const seenPairs = new Set();
  const invalidRows = [];
  const preview = [];
  let validRows = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || !row.length) continue;

    const record = {};
    REQUIRED_PERFORMANCE_HEADERS.forEach((header) => {
      record[header] = row[byIndex[header]] ?? '';
    });

    const studentId = normalizeStudentId(record.student_id);
    const courseCode = normalizeCsvValue(record.course_code).toUpperCase();
    const rowErrors = [];

    if (!studentId) {
      rowErrors.push({ field: 'student_id', problem: 'Missing student id', expected: 'A valid student_id is required.' });
    } else if (!studentMap.has(studentId)) {
      rowErrors.push({ field: 'student_id', problem: `Student ID ${studentId} was not found in public.students`, expected: 'Student ID must exist in public.students.' });
    }

    if (!courseCode) {
      rowErrors.push({ field: 'course_code', problem: 'Missing course code', expected: 'A valid course_code is required.' });
    } else if (!courseMap.has(courseCode)) {
      rowErrors.push({ field: 'course_code', problem: `Course code ${courseCode} was not found in public.courses`, expected: 'Course code must exist in public.courses.' });
    }

    const pairKey = `${studentId}|${courseCode}`;
    if (studentId && courseCode && seenPairs.has(pairKey)) {
      rowErrors.push({ field: 'student_id', problem: `Duplicate record for student ${studentId} and course ${courseCode}`, expected: 'Each student/course combination should appear once.' });
    } else if (studentId && courseCode) {
      seenPairs.add(pairKey);
    }

    const scoreFields = ['theory_score', 'practical_score', 'hands_on_score', 'project_score'];
    scoreFields.forEach((field) => {
      const rawValue = normalizeCsvValue(record[field]);
      if (rawValue === '') {
        rowErrors.push({ field, problem: 'Missing score', expected: 'Score is required for all four components.' });
      } else {
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) {
          rowErrors.push({ field, problem: 'Non-numeric score', expected: 'Use a numeric value between 0 and 100.' });
        } else if (numericValue < 0 || numericValue > 100) {
          rowErrors.push({ field, problem: 'Score outside valid range', expected: 'Expected 0–100.' });
        }
      }
    });

    if (rowErrors.length) {
      invalidRows.push({ row: rowIndex + 1, course: courseCode || 'Unknown', errors: rowErrors });
      preview.push({ row: rowIndex + 1, course: courseCode || studentId || 'Unknown', status: 'Invalid', summary: `${rowErrors.length} issue${rowErrors.length > 1 ? 's' : ''}` });
    } else {
      validRows += 1;
      preview.push({ row: rowIndex + 1, course: courseCode, status: 'Valid', summary: `${record.theory_score} / ${record.practical_score} / ${record.hands_on_score} / ${record.project_score}` });
    }
  }

  return {
    totalRows: Math.max(rows.length - 1, 0),
    validRows,
    invalidRows: invalidRows.length,
    warnings: [],
    errors: invalidRows.flatMap((entry) => entry.errors.map((issue) => ({ row: entry.row, course: entry.course, field: issue.field, problem: issue.problem, expected: issue.expected }))),
    preview
  };
}

/**
 * End-to-end database-driven calculation pipeline for performance upload batch.
 * Computes: Competency Score, Same-Course Percentile, Dynamic Credits, Previous Credits, and Credit Difference.
 */
export function calculateAcademicPerformanceBatch(rows, context = {}) {
  const validation = validatePerformanceUpload(rows, context.students, context.courses);
  if (validation.errors.length > 0) {
    return {
      validation,
      calculatedRecords: [],
      courseConfigurations: [],
      summaryMetrics: null,
      bandErrors: []
    };
  }

  const rawHeaders = rows[0]?.map((cell) => normalizeCsvValue(cell)) ?? [];
  const normalizedHeaders = rawHeaders.map(normalizeHeader);
  const byIndex = Object.fromEntries(
    REQUIRED_PERFORMANCE_HEADERS.map((header) => [header, normalizedHeaders.indexOf(header)])
  );

  const studentMap = new Map(
    (context.students ?? []).map((student) => [normalizeStudentId(student.student_id), student])
  );
  const courseMap = new Map(
    (context.courses ?? []).map((course) => [String(course.course_code).trim().toUpperCase(), course])
  );

  // Dual-index map for student_records: by student UUID and by registration number
  const studentRecordsMap = new Map();
  (context.studentRecords ?? []).forEach((rec) => {
    if (rec.student_id) {
      studentRecordsMap.set(String(rec.student_id).trim(), rec);
    }
    if (rec.id) {
      studentRecordsMap.set(String(rec.id).trim(), rec);
    }
  });

  (context.students ?? []).forEach((s) => {
    const rec = studentRecordsMap.get(String(s.id).trim());
    if (rec && s.student_id) {
      studentRecordsMap.set(normalizeStudentId(s.student_id), rec);
    }
  });

  const parsedItems = [];
  const courseCodesPresent = new Set();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || !row.length) continue;

    const record = {};
    REQUIRED_PERFORMANCE_HEADERS.forEach((header) => {
      record[header] = row[byIndex[header]] ?? '';
    });

    const studentIdStr = normalizeStudentId(record.student_id);
    const courseCodeStr = normalizeCsvValue(record.course_code).toUpperCase();
    const student = studentMap.get(studentIdStr);
    const course = courseMap.get(courseCodeStr);

    if (!student || !course) continue;

    const theoryScore = Number(record.theory_score);
    const practicalScore = Number(record.practical_score);
    const handsOnScore = Number(record.hands_on_score);
    const projectScore = Number(record.project_score);

    const competencyScore = calculateCompetencyScore(course, {
      theory_score: theoryScore,
      practical_score: practicalScore,
      hands_on_score: handsOnScore,
      project_score: projectScore
    });

    courseCodesPresent.add(courseCodeStr);

    parsedItems.push({
      tempId: `upload-${rowIndex}`,
      rowIndex: rowIndex + 1,
      student,
      course,
      scores: {
        theory: theoryScore,
        practical: practicalScore,
        handsOn: handsOnScore,
        project: projectScore
      },
      competencyScore
    });
  }

  // Calculate cohort percentiles per course cohort
  const cohortPercentilesMap = new Map();
  courseCodesPresent.forEach((courseCodeStr) => {
    const targetCourse = courseMap.get(courseCodeStr);
    if (!targetCourse) return;

    const existingDbPerformance = (context.existingPerformance ?? [])
      .filter((p) => String(p.course_id) === String(targetCourse.id))
      .map((p, idx) => ({
        id: `db-${p.id || idx}`,
        competency_score: calculateCompetencyScore(targetCourse, {
          theory_score: p.theory_score,
          practical_score: p.practical_score,
          hands_on_score: p.hands_on_score,
          project_score: p.project_score
        })
      }));

    const currentBatchCohort = parsedItems
      .filter((item) => item.course.course_code === courseCodeStr)
      .map((item) => ({ id: item.tempId, competency_score: item.competencyScore }));

    const fullCohort = [...existingDbPerformance, ...currentBatchCohort];
    const percentiles = calculateSameCoursePercentiles(fullCohort);

    currentBatchCohort.forEach((item) => {
      const pInfo = percentiles.get(item.id) ?? { percentile: 100.0, rank: 1, cohortCount: fullCohort.length };
      cohortPercentilesMap.set(item.id, pInfo);
    });
  });

  const bandErrors = [];

  // Complete calculated records with credit band match & previous credit comparison
  const calculatedRecords = parsedItems.map((item) => {
    const pInfo = cohortPercentilesMap.get(item.tempId) ?? { percentile: 100.0, rank: 1, cohortCount: 1 };
    const bandResult = matchCreditAllocationBand(
      context.activePolicy,
      context.creditBands,
      item.course.reference_credits,
      pInfo.percentile
    );

    const matchedBand = bandResult.band;
    const bandError = bandResult.error;
    if (bandError && !bandErrors.includes(bandError)) {
      bandErrors.push(bandError);
    }

    const refCredits = Number(item.course.reference_credits ?? 3);
    const dynamicCredits = matchedBand ? Number(matchedBand.credits_awarded) : null;

    const studentRec = studentRecordsMap.get(String(item.student.id)) ?? studentRecordsMap.get(normalizeStudentId(item.student.student_id));
    const prevInfo = lookupPreviousCredits(studentRec, item.student.student_id, item.course);
    const previousCredits = prevInfo.previousCredits;

    const creditDifference = (dynamicCredits !== null && previousCredits !== null) ? (dynamicCredits - previousCredits) : null;

    return {
      row: item.rowIndex,
      studentId: item.student.student_id,
      studentDbId: item.student.id,
      studentName: item.student.student_name,
      courseCode: item.course.course_code,
      courseDbId: item.course.id,
      courseName: item.course.course_name,
      theory: item.scores.theory,
      practical: item.scores.practical,
      handsOn: item.scores.handsOn,
      project: item.scores.project,
      weights: {
        theory: Number(item.course.theory_percentage),
        practical: Number(item.course.practical_percentage),
        handsOn: Number(item.course.hands_on_percentage),
        project: Number(item.course.project_percentage)
      },
      competencyScore: item.competencyScore,
      percentile: pInfo.percentile,
      cohortRank: pInfo.rank,
      cohortCount: pInfo.cohortCount,
      referenceCredits: refCredits,
      activePolicy: context.activePolicy ? {
        id: context.activePolicy.id,
        policyName: context.activePolicy.policy_name,
        version: context.activePolicy.version
      } : null,
      bandName: matchedBand?.band_name ?? null,
      bandId: matchedBand?.id ?? null,
      policyId: matchedBand?.policy_id ?? context.activePolicy?.id ?? null,
      dynamicCredits,
      previousCredits,
      previousCreditSource: 'completed_courses',
      previousCourseMatchType: prevInfo.matchType,
      previousCourseId: prevInfo.previousCourseId,
      currentCourseId: item.course.id,
      previousCreditsStatus: prevInfo.status,
      previousCreditsDetail: prevInfo.detail,
      creditDifference,
      bandError,
      details: {
        formula: `(${item.scores.theory} × ${item.course.theory_percentage}% + ${item.scores.practical} × ${item.course.practical_percentage}% + ${item.scores.handsOn} × ${item.course.hands_on_percentage}% + ${item.scores.project} × ${item.course.project_percentage}%) / 100 = ${item.competencyScore}`,
        percentileInfo: `Rank ${pInfo.rank} of ${pInfo.cohortCount} in ${item.course.course_code} cohort (${pInfo.percentile}th percentile)`,
        policyInfo: context.activePolicy ? `${context.activePolicy.policy_name} (v${context.activePolicy.version})` : 'No active credit policy found',
        bandInfo: matchedBand ? `${matchedBand.band_name} (Percentile range: ${matchedBand.percentile_min}%–${matchedBand.percentile_max}% → credits_awarded: ${matchedBand.credits_awarded})` : (bandError || 'No credit allocation band matched'),
        previousCreditInfo: prevInfo.previousCredits !== null
          ? `Current Course ID: ${item.course.id} | Historical Course ID: ${prevInfo.previousCourseId || 'N/A'} | Match Type: ${prevInfo.matchType} → Previously Obtained Credits: ${prevInfo.previousCredits}`
          : 'Academic history record unavailable',
        creditComparison: (dynamicCredits !== null && previousCredits !== null) ? `Dynamic credits (${dynamicCredits}) - Previous credits (${previousCredits}) = ${creditDifference >= 0 ? '+' : ''}${creditDifference}` : 'Dynamic credit comparison unavailable'
      }
    };
  });

  const courseConfigurations = Array.from(courseCodesPresent).map((code) => {
    const courseObj = courseMap.get(code);
    return {
      courseCode: courseObj.course_code,
      courseName: courseObj.course_name,
      referenceCredits: courseObj.reference_credits,
      minCredits: courseObj.min_credits,
      maxCredits: courseObj.max_credits,
      weights: {
        theory: courseObj.theory_percentage,
        practical: courseObj.practical_percentage,
        handsOn: courseObj.hands_on_percentage,
        project: courseObj.project_percentage
      },
      activePolicyName: context.activePolicy?.policy_name ?? 'None Active',
      activePolicyVersion: context.activePolicy?.version ?? 'N/A',
      allocationBands: (context.creditBands ?? []).filter((b) =>
        context.activePolicy && String(b.policy_id) === String(context.activePolicy.id) && Number(b.reference_credits) === Number(courseObj.reference_credits)
      )
    };
  });

  const totalComp = calculatedRecords.reduce((sum, r) => sum + r.competencyScore, 0);
  const avgCompetency = calculatedRecords.length ? Math.round((totalComp / calculatedRecords.length) * 100) / 100 : 0;
  const validDiffRecords = calculatedRecords.filter(r => r.creditDifference !== null);
  const netCreditChange = validDiffRecords.reduce((sum, r) => sum + r.creditDifference, 0);

  const summaryMetrics = {
    totalRows: validation.totalRows,
    validRows: validation.validRows,
    invalidRows: validation.invalidRows + (bandErrors.length ? calculatedRecords.filter(r => r.bandError).length : 0),
    avgCompetency,
    netCreditChange,
    courseCount: courseConfigurations.length,
    hasBandErrors: bandErrors.length > 0
  };

  return {
    validation,
    calculatedRecords,
    courseConfigurations,
    summaryMetrics,
    bandErrors
  };
}

export const REQUIRED_CONFIG_HEADERS = [
  'course_code',
  'course_name',
  'theory_percentage',
  'practical_percentage',
  'hands_on_percentage',
  'project_percentage',
  'reference_credits',
  'min_credits',
  'max_credits',
  'competency_required'
];

export function validateCourseConfigurationUpload(rows, availableCourses) {
  if (!rows || !rows.length) {
    return {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      warnings: [],
      errors: [{ row: 1, course: '—', field: 'headers', problem: 'The uploaded file is empty.', expected: REQUIRED_CONFIG_HEADERS.join(', ') }],
      preview: []
    };
  }

  const rawHeaders = rows[0]?.map((cell) => normalizeCsvValue(cell)) ?? [];
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  const missingHeaders = REQUIRED_CONFIG_HEADERS.filter((key) => !normalizedHeaders.includes(key));
  const unexpectedHeaders = normalizedHeaders.filter((key) => key && !REQUIRED_PERFORMANCE_HEADERS.includes(key));

  if (missingHeaders.length > 0) {
    return {
      totalRows: Math.max(rows.length - 1, 0),
      validRows: 0,
      invalidRows: Math.max(rows.length - 1, 0),
      warnings: [],
      errors: [{
        row: 1,
        course: '—',
        field: 'headers',
        problem: `Missing required headers: ${missingHeaders.join(', ')}`,
        expected: REQUIRED_CONFIG_HEADERS.join(', '),
        detectedHeaders: rawHeaders,
        normalizedHeaders,
        missingHeaders,
        unexpectedHeaders
      }],
      preview: []
    };
  }

  const byIndex = Object.fromEntries(
    REQUIRED_CONFIG_HEADERS.map((header) => [header, normalizedHeaders.indexOf(header)])
  );
  const normalizedCourses = new Map((availableCourses ?? []).map((course) => [String(course.course_code).trim().toUpperCase(), course]));
  const seenCodes = new Set();
  const invalidRows = [];
  const preview = [];
  let validRows = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || !row.length) continue;

    const record = {};
    REQUIRED_CONFIG_HEADERS.forEach((header) => {
      record[header] = row[byIndex[header]] ?? '';
    });

    const courseCode = normalizeCsvValue(record.course_code).toUpperCase();
    const courseName = normalizeCsvValue(record.course_name);
    const rowErrors = [];

    if (!courseCode) rowErrors.push({ field: 'course_code', problem: 'Missing course code', expected: 'Course code is required.' });
    if (!courseName) rowErrors.push({ field: 'course_name', problem: 'Missing course name', expected: 'Course name is required.' });

    if (courseCode && seenCodes.has(courseCode)) {
      rowErrors.push({ field: 'course_code', problem: 'Duplicate course code in upload', expected: 'Each course code should appear once in the file.' });
    } else if (courseCode) {
      seenCodes.add(courseCode);
    }

    if (courseCode && !normalizedCourses.has(courseCode)) {
      rowErrors.push({ field: 'course_code', problem: `Course code ${courseCode} was not found in public.courses`, expected: 'Course code must match an existing public.courses record.' });
    }

    const numericFields = ['theory_percentage', 'practical_percentage', 'hands_on_percentage', 'project_percentage', 'reference_credits', 'min_credits', 'max_credits', 'competency_required'];
    numericFields.forEach((field) => {
      const rawValue = normalizeCsvValue(record[field]);
      const numericValue = Number(rawValue);
      if (!rawValue) {
        rowErrors.push({ field, problem: 'Missing value', expected: 'A numeric value is required.' });
      } else if (!Number.isFinite(numericValue)) {
        rowErrors.push({ field, problem: 'Invalid number', expected: 'Use a valid numeric value.' });
      }
    });

    const theory = Number(normalizeCsvValue(record.theory_percentage));
    const practical = Number(normalizeCsvValue(record.practical_percentage));
    const handsOn = Number(normalizeCsvValue(record.hands_on_percentage));
    const project = Number(normalizeCsvValue(record.project_percentage));
    const totalWeight = [theory, practical, handsOn, project].filter((value) => Number.isFinite(value)).reduce((sum, value) => sum + value, 0);

    if (Number.isFinite(theory) && Number.isFinite(practical) && Number.isFinite(handsOn) && Number.isFinite(project) && Math.abs(totalWeight - 100) > 0.0001) {
      rowErrors.push({ field: 'weights', problem: 'Component weights must total 100%.', expected: 'The weight total should equal 100.' });
    }

    if (Number.isFinite(theory) && (theory < 0 || theory > 100)) rowErrors.push({ field: 'theory_percentage', problem: 'Invalid range', expected: 'Expected 0–100.' });
    if (Number.isFinite(practical) && (practical < 0 || practical > 100)) rowErrors.push({ field: 'practical_percentage', problem: 'Invalid range', expected: 'Expected 0–100.' });
    if (Number.isFinite(handsOn) && (handsOn < 0 || handsOn > 100)) rowErrors.push({ field: 'hands_on_percentage', problem: 'Invalid range', expected: 'Expected 0–100.' });
    if (Number.isFinite(project) && (project < 0 || project > 100)) rowErrors.push({ field: 'project_percentage', problem: 'Invalid range', expected: 'Expected 0–100.' });

    const referenceCredits = Number(normalizeCsvValue(record.reference_credits));
    const minCredits = Number(normalizeCsvValue(record.min_credits));
    const maxCredits = Number(normalizeCsvValue(record.max_credits));
    const competencyRequired = Number(normalizeCsvValue(record.competency_required));

    if (Number.isFinite(referenceCredits) && (referenceCredits <= 0)) rowErrors.push({ field: 'reference_credits', problem: 'Reference credits must be greater than 0', expected: 'Expected a positive credit value.' });
    if (Number.isFinite(minCredits) && Number.isFinite(maxCredits) && minCredits > maxCredits) rowErrors.push({ field: 'min_credits', problem: 'Minimum credits exceed maximum credits', expected: 'Minimum credits must be less than or equal to maximum credits.' });
    if (Number.isFinite(competencyRequired) && (competencyRequired < 0 || competencyRequired > 100)) rowErrors.push({ field: 'competency_required', problem: 'Competency requirement is outside the valid range', expected: 'Expected 0–100.' });

    if (rowErrors.length) {
      invalidRows.push({ row: rowIndex + 1, course: courseCode || 'Unknown', errors: rowErrors });
      preview.push({ row: rowIndex + 1, course: courseCode || 'Unknown', status: 'Invalid', summary: `${rowErrors.length} issue${rowErrors.length > 1 ? 's' : ''}` });
    } else {
      validRows += 1;
      preview.push({ row: rowIndex + 1, course: courseCode, status: 'Valid', summary: `${theory}% / ${practical}% / ${handsOn}% / ${project}%` });
    }
  }

  return {
    totalRows: Math.max(rows.length - 1, 0),
    validRows,
    invalidRows: invalidRows.length,
    warnings: [],
    errors: invalidRows.flatMap((entry) => entry.errors.map((issue) => ({ row: entry.row, course: entry.course, field: issue.field, problem: issue.problem, expected: issue.expected }))),
    preview
  };
}
