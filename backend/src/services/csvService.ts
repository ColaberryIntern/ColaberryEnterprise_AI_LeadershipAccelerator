import { Parser } from 'json2csv';
import { Enrollment } from '../models';

export async function generateEnrollmentCsv(cohortId: string): Promise<string> {
  const enrollments = await Enrollment.findAll({
    where: { cohort_id: cohortId },
    order: [['created_at', 'ASC']],
    raw: true,
  });

  const fields = [
    { label: 'ID', value: 'id' },
    { label: 'Full Name', value: 'full_name' },
    { label: 'Email', value: 'email' },
    { label: 'Company', value: 'company' },
    { label: 'Title', value: 'title' },
    { label: 'Phone', value: 'phone' },
    { label: 'Company Size', value: 'company_size' },
    { label: 'Payment Status', value: 'payment_status' },
    { label: 'Payment Method', value: 'payment_method' },
    { label: 'Enrolled At', value: 'created_at' },
  ];

  const parser = new Parser({ fields });
  return parser.parse(enrollments);
}
