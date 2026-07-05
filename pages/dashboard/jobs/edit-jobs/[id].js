import { Row, Col, Container, Card } from 'react-bootstrap';
import { GeeksSEO } from 'widgets'
import toast from 'react-hot-toast';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { jobService } from '../../../../lib/supabase/database';
import { getSupabaseClient } from '../../../../lib/supabase/client';
import { toLocalYmd } from '../../../../lib/utils/localDate';
import { formatSingaporeTimeHm, toSingaporeYmd } from '../../../../lib/utils/singaporeDateTime';
import Link from 'next/link';
import EditJobFormSkeleton from '../../../../sub-components/dashboard/jobs/_components/EditJobFormSkeleton';

const pageHeaderStyle = {
  background: "linear-gradient(90deg, #4171F5 0%, #3DAAF5 100%)",
  padding: "1.5rem 2rem",
  borderRadius: "0 0 24px 24px",
  marginTop: "-39px",
  marginLeft: "10px",
  marginRight: "10px",
  marginBottom: "20px",
};

function EditJobPageLoading({ jobNo = null, message, subMessage }) {
  return (
    <Container>
      <GeeksSEO title="Edit Job | SAS&ME - SAP B1 | Portal" />
      <Row>
        <Col lg={12} md={12} sm={12}>
          <div style={pageHeaderStyle}>
            <div className="d-flex justify-content-between align-items-start">
              <div className="d-flex flex-column">
                <div className="mb-3">
                  <h1
                    className="mb-2"
                    style={{
                      fontSize: "28px",
                      fontWeight: "600",
                      color: "#FFFFFF",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {jobNo ? `Edit Job #${jobNo}` : "Edit Job"}
                  </h1>
                  <p
                    className="mb-2"
                    style={{
                      fontSize: "16px",
                      color: "rgba(255, 255, 255, 0.7)",
                      fontWeight: "400",
                      lineHeight: "1.5",
                    }}
                  >
                    Update job details, assignments, and schedules
                  </p>
                </div>

                <nav style={{ fontSize: "14px", fontWeight: "500" }}>
                  <div className="d-flex align-items-center">
                    <i
                      className="fe fe-home"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    ></i>
                    <Link
                      href="/dashboard"
                      className="text-decoration-none ms-2"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      Dashboard
                    </Link>
                    <span className="mx-2" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                      /
                    </span>
                    <Link
                      href="/dashboard/jobs/list-jobs"
                      className="text-decoration-none"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      Jobs
                    </Link>
                    <span className="mx-2" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                      /
                    </span>
                    <span style={{ color: "#FFFFFF" }}>Edit Job</span>
                  </div>
                </nav>
              </div>
            </div>
          </div>
        </Col>
        <Col xl={12} lg={12} md={12} sm={12}>
          <Card className="shadow-sm">
            <Card.Body>
              <EditJobFormSkeleton message={message} subMessage={subMessage} />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

const EditJobs = dynamic(
  () => import('sub-components/dashboard/jobs/EditJobs'),
  {
    ssr: false,
    loading: () => (
      <EditJobPageLoading
        message="Please wait while we load the form"
        subMessage="Preparing the job editor..."
      />
    ),
  }
);

const EditJobPage = () => {
  const router = useRouter();
  const rawId = router.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const [jobData, setJobData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;

    if (!id) {
      setIsLoading(false);
      return;
    }

    const fetchJobData = async () => {
      try {
        setIsLoading(true);

        const jobData = await jobService.findById(id);

        if (jobData) {
          // Normalize Supabase data to match component expectations
          const normalizedData = {
            id: jobData.id,
            jobID: jobData.id,
            jobNo: jobData.job_number || jobData.jobNo,
            jobName: jobData.title || jobData.jobName,
            jobStatus: (() => {
              const raw = jobData.status ?? jobData.jobStatus;
              const v = raw != null ? String(raw).trim() : "";
              if (!v || v.toLowerCase() === "created") return "554";
              return v;
            })(),
            jobDescription: jobData.description || jobData.jobDescription || "",
            // customerID is Supabase UUID; customerCode is SAP CardCode for API calls
            customerID: jobData.customer_id || jobData.customerID,
            customerId: jobData.customer_id || jobData.customer?.id || jobData.customerId,
            customerName: jobData.customer?.customer_name || jobData.customerName,
            customerCode: jobData.customer?.customer_code || jobData.customerCode || "",
            customer_address: jobData.customer?.customer_address || jobData.customer_address || "",
            email: jobData.customer?.email || jobData.email || "",
            phone_number: jobData.customer?.phone_number || jobData.phone_number || "",
            source: jobData.customer?.source || "",
            startDate: jobData.scheduled_start ? toSingaporeYmd(jobData.scheduled_start) || toLocalYmd(jobData.scheduled_start) : jobData.startDate || "",
            endDate: jobData.scheduled_end ? toSingaporeYmd(jobData.scheduled_end) || toLocalYmd(jobData.scheduled_end) : jobData.endDate || "",
            startTime: jobData.scheduled_start
              ? formatSingaporeTimeHm(jobData.scheduled_start) || (jobData.startTime || "").substring(0, 5)
              : (jobData.startTime || "").substring(0, 5),
            endTime: jobData.scheduled_end
              ? formatSingaporeTimeHm(jobData.scheduled_end) || (jobData.endTime || "").substring(0, 5)
              : (jobData.endTime || "").substring(0, 5),
            priority: jobData.priority || "",
            serviceCallID: jobData.service_call?.call_number || jobData.serviceCallID || "",
            salesOrderID: jobData.sales_order?.document_number || jobData.salesOrderID || "",
            scheduleSession: jobData.scheduleSession || "",
            estimatedDurationHours:
              jobData.estimatedDurationHours !== undefined &&
              jobData.estimatedDurationHours !== null
                ? jobData.estimatedDurationHours
                : "",
            estimatedDurationMinutes:
              jobData.estimatedDurationMinutes !== undefined &&
              jobData.estimatedDurationMinutes !== null
                ? jobData.estimatedDurationMinutes
                : "",
            assignedWorkers: (jobData.technician_jobs || [])
              .filter((tj) => tj.deleted_at == null)
              .map(tj => ({
                workerId: tj.technician?.user_id || tj.technician?.user?.id,
                technician_id: tj.technician_id,
                workerName: tj.technician?.full_name || tj.technician?.user?.full_name || 'Unknown',
              })),
            taskList: (jobData.job_tasks || []).map((task, index) => ({
              taskID: task.id || `task-${index}`,
              taskName: task.task_name || '',
              taskDescription: task.task_description || '',
              isPriority: task.is_required || false,
              isDone: false,
              createdAt: task.created_at || null,
              completionDate: null
            })),
            equipments: (jobData.job_equipments || []).map(je => {
              const eq = je.equipment || {};
              return {
                id: eq.id || je.equipment_id,
                itemName: eq.item_name || 'Unnamed Equipment',
                itemCode: eq.item_code || '',
                modelSeries: eq.model_series || '',
                itemGroup: eq.item_group || '',
                serialNo: eq.serial_number || '',
                equipmentLocation: eq.equipment_location || '',
                equipmentType: eq.equipment_type || '',
                brand: eq.brand || '',
                notes: eq.notes || je.notes || ''
              };
            }),
            location: jobData.location ? {
              locationName: jobData.location.location_name || jobData.location.locationName || "",
              // Note: locations table doesn't have address fields, they come from customer_location or API
              // Address will be populated when location is matched with API data
              address: jobData.location.address || {
                streetNo: "",
                streetAddress: "",
                block: "",
                buildingNo: "",
                city: "",
                stateProvince: "",
                postalCode: "",
                country: "",
              },
              coordinates: {
                latitude: jobData.location.current_latitude || jobData.location.coordinates?.latitude || "",
                longitude: jobData.location.current_longitude || jobData.location.coordinates?.longitude || "",
              },
            } : {},
            contact: jobData.contact ? {
              contactID: jobData.contact.id || '',
              contactFullname: `${jobData.contact.first_name || ''} ${jobData.contact.middle_name || ''} ${jobData.contact.last_name || ''}`.trim(),
              firstName: jobData.contact.first_name || '',
              middleName: jobData.contact.middle_name || '',
              lastName: jobData.contact.last_name || '',
              phoneNumber: jobData.contact.tel1 || '',
              mobilePhone: jobData.contact.tel2 || '',
              email: jobData.contact.email || '',
            } : {},
            contactId: jobData.contact_id || jobData.contact?.id || null,
            jobContactType: jobData.job_contact_type && jobData.job_contact_type.length > 0 ? {
              code: jobData.job_contact_type[0].code,
              name: jobData.job_contact_type[0].name
            } : null,
          };

          const supabase = getSupabaseClient();
          const enrichmentTasks = [];

          if (supabase && normalizedData.id) {
            enrichmentTasks.push(
              (async () => {
                const { data: jobSchedule } = await supabase
                  .from("job_schedule")
                  .select("*")
                  .eq("job_id", normalizedData.id)
                  .maybeSingle();
                return { type: "schedule", jobSchedule };
              })()
            );
          }

          if (
            supabase &&
            !normalizedData.customerCode &&
            normalizedData.customerID
          ) {
            enrichmentTasks.push(
              (async () => {
                const { data: customerRow } = await supabase
                  .from("customer")
                  .select(
                    "customer_code, customer_address, email, phone_number, source"
                  )
                  .eq("id", normalizedData.customerID)
                  .maybeSingle();
                return { type: "customer", customerRow };
              })()
            );
          }

          if (
            supabase &&
            normalizedData.customerID &&
            !normalizedData.contact?.contactID
          ) {
            enrichmentTasks.push(
              (async () => {
                if (jobData.contact_id) {
                  const { data: contact } = await supabase
                    .from("contacts")
                    .select("*")
                    .eq("id", jobData.contact_id)
                    .maybeSingle();
                  return { type: "contact", contact, fromJobFk: true };
                }

                const { data: contacts } = await supabase
                  .from("contacts")
                  .select("*")
                  .eq("customer_id", normalizedData.customerID)
                  .limit(1);

                return {
                  type: "contact",
                  contact: contacts?.[0] || null,
                  fromJobFk: false,
                };
              })()
            );
          }

          const serviceCallIdRaw = normalizedData.serviceCallID;
          const serviceCallIsUuid =
            serviceCallIdRaw &&
            String(serviceCallIdRaw).includes("-") &&
            String(serviceCallIdRaw).length === 36;

          if (supabase && serviceCallIsUuid) {
            enrichmentTasks.push(
              (async () => {
                const { data: serviceCall } = await supabase
                  .from("service_call")
                  .select("call_number")
                  .eq("id", serviceCallIdRaw)
                  .is("deleted_at", null)
                  .maybeSingle();
                return { type: "serviceCall", serviceCall };
              })()
            );
          }

          if (enrichmentTasks.length > 0) {
            const results = await Promise.all(enrichmentTasks);
            const mapContactRow = (contact) => ({
              contactID: contact.id || contact.contactId || "",
              contactFullname: `${contact.first_name || ""} ${contact.middle_name || ""} ${contact.last_name || ""}`.trim(),
              firstName: contact.first_name || "",
              middleName: contact.middle_name || "",
              lastName: contact.last_name || "",
              phoneNumber: contact.tel1 || "",
              mobilePhone: contact.tel2 || "",
              email: contact.email || "",
            });

            for (const result of results) {
              if (result.type === "schedule" && result.jobSchedule?.dur) {
                const jobSchedule = result.jobSchedule;
                if (jobSchedule.dur_type === "hours") {
                  const durDecimal = parseFloat(jobSchedule.dur);
                  if (!isNaN(durDecimal)) {
                    const hours = Math.floor(durDecimal);
                    const minutes = Math.round((durDecimal - hours) * 60);
                    normalizedData.estimatedDurationHours = hours;
                    normalizedData.estimatedDurationMinutes = minutes;
                    normalizedData.manualDuration = true;
                  }
                }
              }

              if (result.type === "customer" && result.customerRow) {
                const customerRow = result.customerRow;
                if (customerRow.customer_code) {
                  normalizedData.customerCode = customerRow.customer_code;
                }
                if (!normalizedData.customer_address && customerRow.customer_address) {
                  normalizedData.customer_address = customerRow.customer_address;
                }
                if (!normalizedData.email && customerRow.email) {
                  normalizedData.email = customerRow.email;
                }
                if (!normalizedData.phone_number && customerRow.phone_number) {
                  normalizedData.phone_number = customerRow.phone_number;
                }
                if (!normalizedData.source && customerRow.source) {
                  normalizedData.source = customerRow.source;
                }
              }

              if (result.type === "contact" && result.contact) {
                normalizedData.contact = mapContactRow(result.contact);
                if (result.fromJobFk) {
                  normalizedData.contactId = result.contact.id;
                }
              }

              if (result.type === "serviceCall" && result.serviceCall?.call_number) {
                normalizedData.serviceCallID =
                  result.serviceCall.call_number.toString();
              }
            }
          }

          // Fallback: derive duration from start/end times when job_schedule has no dur
          const hasSavedDuration =
            normalizedData.estimatedDurationHours !== '' &&
            normalizedData.estimatedDurationHours != null;
          if (
            !hasSavedDuration &&
            normalizedData.startTime &&
            normalizedData.endTime
          ) {
            const [startHours, startMinutes] = normalizedData.startTime.split(':').map(Number);
            const [endHours, endMinutes] = normalizedData.endTime.split(':').map(Number);
            if (
              !Number.isNaN(startHours) &&
              !Number.isNaN(startMinutes) &&
              !Number.isNaN(endHours) &&
              !Number.isNaN(endMinutes)
            ) {
              let totalMinutes =
                endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
              if (totalMinutes < 0) totalMinutes += 24 * 60;
              if (totalMinutes > 0) {
                normalizedData.estimatedDurationHours = Math.floor(totalMinutes / 60);
                normalizedData.estimatedDurationMinutes = totalMinutes % 60;
              }
            }
          }

          if (
            !normalizedData.source &&
            /^CP\d+$/i.test(String(normalizedData.customerCode || "").trim())
          ) {
            normalizedData.source = "portal";
          }

          setJobData(normalizedData);
        } else {
          setError("Job not found");
          toast.error("Job not found");
        }
      } catch (err) {
        console.error("Error fetching job:", err);
        setError(err.message);
        toast.error(`Error fetching job: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchJobData();
  }, [id, router.isReady]);

  if (!router.isReady) {
    return (
      <EditJobPageLoading
        message="Please wait while we load the job"
        subMessage="Fetching job details and related data..."
      />
    );
  }

  if (!id) {
    return (
      <Container>
        <div className="text-center py-5">
          <h3 className="text-danger">Invalid link</h3>
          <p className="text-muted">No job ID was found in the URL.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => router.push("/jobs")}
          >
            Back to Jobs List
          </button>
        </div>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <EditJobPageLoading
        message="Please wait while we load the job"
        subMessage="Fetching job details and related data..."
      />
    );
  }

  if (error) {
    return (
      <Container>
        <div className="text-center py-5">
          <h3 className="text-danger">Error</h3>
          <p>{error}</p>
          <button 
            className="btn btn-primary" 
            onClick={() => router.push('/jobs')}
          >
            Back to Jobs List
          </button>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <GeeksSEO title="Edit Job | SAS&ME - SAP B1 | Portal" />
      <Row>
        <Col lg={12} md={12} sm={12}>
          <div style={pageHeaderStyle}>
            <div className="d-flex justify-content-between align-items-start">
              <div className="d-flex flex-column">
                <div className="mb-3">
                  <h1
                    className="mb-2"
                    style={{
                      fontSize: "28px",
                      fontWeight: "600",
                      color: "#FFFFFF",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Edit Job #{jobData?.jobNo}
                  </h1>
                  <p
                    className="mb-2"
                    style={{
                      fontSize: "16px",
                      color: "rgba(255, 255, 255, 0.7)",
                      fontWeight: "400",
                      lineHeight: "1.5",
                    }}
                  >
                    Update job details, assignments, and schedules
                  </p>
                </div>

                <nav
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  <div className="d-flex align-items-center">
                    <i
                      className="fe fe-home"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    ></i>
                    <Link
                      href="/dashboard"
                      className="text-decoration-none ms-2"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      Dashboard
                    </Link>
                    <span
                      className="mx-2"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      /
                    </span>
                    <Link
                      href="/dashboard/jobs/list-jobs"
                      className="text-decoration-none"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      Jobs
                    </Link>
                    <span
                      className="mx-2"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      /
                    </span>
                    <span style={{ color: "#FFFFFF" }}>Edit Job</span>
                  </div>
                </nav>
              </div>
            </div>
          </div>
        </Col>
        <Col xl={12} lg={12} md={12} sm={12}>
          <Card className="shadow-sm">
            <Card.Body>
              {jobData && (
                <EditJobs 
                  initialJobData={jobData} 
                  jobId={id} 
                />
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default EditJobPage; 