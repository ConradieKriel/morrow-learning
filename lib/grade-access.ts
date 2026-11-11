/** A student can only see activities for their assigned grade, or activities marked for any grade. */
export function canStudentAccessGrade(studentGrade: string | null | undefined, activityGrade: string | null | undefined): boolean {
  return activityGrade === 'Any grade' || Boolean(studentGrade && activityGrade === studentGrade);
}
