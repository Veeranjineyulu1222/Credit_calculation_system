import re
from typing import List, Dict, Any, Optional

STOP_WORDS = set([
    'what', 'which', 'where', 'when', 'why', 'how', 'about', 'should', 'could', 'would', 'from',
    'have', 'with', 'that', 'this', 'show', 'tell', 'explain', 'summarize', 'course', 'courses',
    'completed', 'academic', 'student', 'competency', 'performance', 'grade', 'grades'
])

def extract_terms(question: str) -> List[str]:
    raw_terms = re.findall(r'[a-z0-9][a-z0-9&+-]{2,}', str(question or '').lower())
    terms = [t for t in raw_terms if t not in STOP_WORDS]
    # Deduplicate preserving order
    seen = set()
    unique_terms = []
    for t in terms:
        if t not in seen:
            seen.add(t)
            unique_terms.append(t)
    return unique_terms[:5]

class QueryClassifier:
    @staticmethod
    def classify(question: str, history: List[Dict[str, Any]] = None, role: str = 'student') -> Dict[str, Any]:
        text = str(question or '').strip().lower()
        history_msgs = list(history or [])
        history_msgs.reverse()
        
        prev_user = next((m.get("content", "") for m in history_msgs if m.get("role") == "user"), "")
        prev_assistant = next((m.get("content", "") for m in history_msgs if m.get("role") == "assistant"), "")
        
        is_follow_up = bool(re.match(r'^(why|which ones?|what about (that|the second|the first)|tell me more|how so)\??$', text))
        
        if 'dynamic credit' in text or 'credits awarded' in text or 'credit band' in text or 'percentile' in text:
            category = 'dynamic_credit'
        elif 'grade' in text or 'marks' in text:
            category = 'grades'
        elif 'credit' in text or 'cgpa' in text or 'earned' in text:
            category = 'credits'
        elif 'outcome' in text or 'course outcome' in text:
            category = 'course_outcomes'
        elif 'completed' in text or 'academic history' in text or 'history' in text:
            category = 'academic_history'
        elif 'profile' in text or 'program' in text or 'semester' in text:
            category = 'student_profile'
        elif 'performance' in text or 'score' in text or 'trend' in text:
            category = 'performance'
        elif 'competenc' in text or 'strong' in text or 'improv' in text or 'support' in text or 'weak' in text:
            category = 'competency'
        else:
            category = 'course_information'
            
        role_category = 'follow_up' if is_follow_up else category
        if role == 'faculty' and not is_follow_up:
            if 'outcome' in text:
                role_category = 'faculty_outcomes'
            elif 'performance' in text or 'score' in text or 'trend' in text:
                role_category = 'faculty_performance'
            elif 'dynamic credit' in text or 'percentile' in text or 'credit band' in text:
                role_category = 'faculty_dynamic_credit'
            elif 'competenc' in text or 'weak' in text or 'strong' in text or 'improv' in text:
                role_category = 'faculty_competency'
            elif 'student' in text or 'students' in text:
                role_category = 'faculty_student_analysis'
            else:
                role_category = 'faculty_course'

        inherited_plan = None
        if is_follow_up and prev_user:
            inherited_plan = QueryClassifier.classify(prev_user, [], role)

        inherited_category = (inherited_plan.get("category") if inherited_plan else (category if category != 'course_information' else 'competency')) if is_follow_up else None
        target_category = inherited_category or category
        is_semantic = target_category in ['competency', 'course_outcomes', 'course_information', 'faculty_course', 'faculty_outcomes', 'faculty_competency', 'curriculum', 'academic_policy']

        curr_terms = extract_terms(question)
        inherited_terms = inherited_plan.get("terms", []) if inherited_plan else extract_terms(prev_user)
        combined_terms = list(dict.fromkeys(curr_terms + inherited_terms))[:5] if is_follow_up else curr_terms

        resolved_q = question
        if is_follow_up and (prev_user or prev_assistant):
            context_str = f"User asked: {prev_user[:300]}. " if prev_user else ""
            context_str += f"Assistant answered: {prev_assistant[:800]}" if prev_assistant else ""
            resolved_q = f"{question} Resolve this follow-up using the previous conversation context: {context_str}"

        return {
            "category": role_category,
            "queryType": role_category,
            "inheritedCategory": inherited_category,
            "inheritedQueryType": inherited_category,
            "inheritedRetrieval": is_follow_up,
            "retrievalMode": "sql_plus_semantic" if is_semantic else "sql_only",
            "sql": True,
            "semantic": is_semantic,
            "terms": combined_terms,
            "resolvedQuestion": resolved_q
        }
