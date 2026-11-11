import { getRequestContext, jsonError } from '@/lib/supabase-server';
import { canStudentAccessGrade } from '@/lib/grade-access';
import { privateJson } from '@/lib/api-security';

export async function GET(request: Request) {
  const auth = await getRequestContext(request);
  if (!auth) return jsonError('Please sign in first.', 401);
  if (auth.profile.role !== 'student') return jsonError('This page is for students.', 403);

  const { data, error } = await auth.supabase.from('activities')
    .select('id,title,subject,grade,description,language,public_slug,updated_at')
    .eq('is_published', true)
    .not('public_slug', 'is', null)
    .order('updated_at', { ascending: false });
  if (error) return jsonError(error.message, 500);
  // Filter on the server so the browser only receives activities for this student's grade.
  const visible = (data || []).filter((activity: { grade: string | null }) =>
    canStudentAccessGrade(auth.profile.grade, activity.grade)
  );
  return privateJson({ activities: visible, grade: auth.profile.grade });
}
