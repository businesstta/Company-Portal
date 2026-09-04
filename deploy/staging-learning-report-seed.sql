-- Staging-only, additive and idempotent LMS sample data for HR report testing.
DO $$
DECLARE
  company_record record;
  course_record record;
  module_record record;
BEGIN
  FOR company_record IN SELECT id FROM companies LOOP
    FOR course_record IN
      SELECT * FROM (VALUES
        ('LDR-DEMO-101','Workplace Safety Essentials','Safety','Core workplace safety practices, hazard reporting and emergency readiness.',90),
        ('LDR-DEMO-102','Data Privacy Awareness','Compliance','Practical privacy, secure information handling and incident reporting.',75),
        ('LDR-DEMO-103','Customer Service Foundations','Customer Service','Communication, service recovery and customer experience fundamentals.',105)
      ) AS courses(code,title,category,description,duration)
    LOOP
      INSERT INTO learning_courses(company_id,course_code,title,description,category,delivery_method,assignment_mode,is_mandatory,duration_minutes,status,certificate_title)
      VALUES(company_record.id,course_record.code,course_record.title,course_record.description,course_record.category,'online','progressive',true,course_record.duration,'active','Certificate of Completion')
      ON CONFLICT(company_id,course_code) DO NOTHING;

      INSERT INTO learning_course_audience_types(course_id,audience_type)
      SELECT id,'all_employees' FROM learning_courses WHERE company_id=company_record.id AND course_code=course_record.code
      ON CONFLICT DO NOTHING;

      FOR module_record IN
        SELECT * FROM (VALUES
          (1,'Fundamentals','Understand the essential concepts and responsibilities.'),
          (2,'Practical Application','Apply the concepts through realistic workplace scenarios.')
        ) AS modules(sequence_no,title,description)
      LOOP
        INSERT INTO learning_modules(course_id,module_code,title,description,sequence_no,audience_type,is_mandatory,duration_minutes,passing_score,max_attempts,credit)
        SELECT c.id,course_record.code||'-M'||module_record.sequence_no,module_record.title,module_record.description,module_record.sequence_no,'all',true,
          CASE WHEN module_record.sequence_no=1 THEN course_record.duration/2 ELSE course_record.duration-(course_record.duration/2) END,NULL,3,1
        FROM learning_courses c
        WHERE c.company_id=company_record.id AND c.course_code=course_record.code
        ON CONFLICT(course_id,sequence_no) DO NOTHING;

        INSERT INTO learning_module_contents(module_id,content_type,title,description,content_body,sequence_no)
        SELECT m.id,'document',module_record.title||' Overview','Read the overview and note the key points.',
          course_record.title||E'\n\n'||module_record.title||E'\n\nThis lesson introduces the key principles employees need for day-to-day work. Review each point, consider how it applies to your role, and discuss questions with your manager or HR.\n\nKey actions\n• Follow the approved company process.\n• Protect people, information and company resources.\n• Report risks or incidents promptly.\n• Ask for guidance whenever requirements are unclear.',1
        FROM learning_modules m JOIN learning_courses c ON c.id=m.course_id
        WHERE c.company_id=company_record.id AND c.course_code=course_record.code AND m.sequence_no=module_record.sequence_no
          AND NOT EXISTS(SELECT 1 FROM learning_module_contents existing WHERE existing.module_id=m.id AND existing.sequence_no=1);

        INSERT INTO learning_module_contents(module_id,content_type,title,description,content_body,sequence_no)
        SELECT m.id,'document',module_record.title||' Workplace Scenario','Use this scenario to test practical understanding.',
          E'Workplace scenario\n\nA team member notices a situation that may conflict with the expected process. They pause the activity, verify the requirement, inform the responsible person and document the action taken.\n\nReflection questions\n1. What risk did the team member identify?\n2. Who should be informed?\n3. What evidence should be recorded?\n4. How can the issue be prevented in future?\n\nComplete the lesson after reviewing your answers.',2
        FROM learning_modules m JOIN learning_courses c ON c.id=m.course_id
        WHERE c.company_id=company_record.id AND c.course_code=course_record.code AND m.sequence_no=module_record.sequence_no
          AND NOT EXISTS(SELECT 1 FROM learning_module_contents existing WHERE existing.module_id=m.id AND existing.sequence_no=2);
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
