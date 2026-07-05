import React, { useState, useEffect, useRef, useCallback } from "react";
import Swal from "sweetalert2";
import { Container, Row, Col, Card, Tabs, Tab, Spinner } from "react-bootstrap";
import { useRouter } from "next/router";
import { userService } from "../../../lib/supabase/database";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { getSupabaseAdmin } from "../../../lib/supabase/server";
import { toast } from "react-toastify";
import { ContactTab } from "sub-components/dashboard/worker/ContactTab";
import { PersonalTab } from "sub-components/dashboard/worker/PersonalTab";
import {
  AccessTab,
  DocumentsTab,
  EmployeeScheduleTab,
  EmploymentTab,
  OtherDetailsTab,
  PayrollTab,
} from "sub-components/dashboard/worker/EmployeeProfileTabs";
import {
  TECHNICIAN_EMPLOYEE_TABLES,
  cloneDefaultWorkerSchedule,
  createTechnicianDocument,
  deleteTechnicianDocument,
  replaceTechnicianSchedule,
  upsertTechnicianProfileSection,
} from "../../../lib/technicians/employeeProfile";
import {
  fetchWorkerCoreByUserId,
  fetchWorkerEmployeeSections,
  invalidateWorkerCache,
} from "../../../lib/technicians/workerData";
import { clientAuditLog } from "../../../utils/clientAuditLog";

/** Hide Employment / Access on edit technician until HR flows are ready. */
const HIDDEN_WORKER_EDIT_TABS = new Set(['employment', 'access']);

const TAB_SECTION_MAP = {
  employment: "employment",
  access: "access",
  payroll: "payroll",
  schedule: "schedule",
  documents: "documents",
  other: "other",
};

const EditWorker = () => {
  const router = useRouter();
  const { workerId } = router.query;
  const [activeTab, setActiveTab] = useState("personal");
  const [personalData, setPersonalData] = useState({});
  const [contactData, setContactData] = useState({});
  const [employeeProfile, setEmployeeProfile] = useState({
    employment: {},
    access: {},
    payroll: {},
    schedule: cloneDefaultWorkerSchedule(),
    documents: [],
    other: {},
  });
  const [technicianId, setTechnicianId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const loadedSectionsRef = useRef(new Set());

  const mergeEmployeeProfile = useCallback((partial) => {
    setEmployeeProfile((prev) => ({ ...prev, ...partial }));
  }, []);

  const loadEmployeeSection = useCallback(
    async (sectionKey, resolvedTechnicianId) => {
      const tid = resolvedTechnicianId || technicianId;
      if (!tid || !TAB_SECTION_MAP[sectionKey]) return;
      if (loadedSectionsRef.current.has(sectionKey)) return;

      const supabase = getSupabaseClient();
      if (!supabase) return;

      setEmployeeLoading(true);
      try {
        const partial = await fetchWorkerEmployeeSections(supabase, tid, {
          sections: [sectionKey],
        });
        mergeEmployeeProfile(partial);
        loadedSectionsRef.current.add(sectionKey);
      } catch (error) {
        console.error(`Error loading ${sectionKey} section:`, error);
      } finally {
        setEmployeeLoading(false);
      }
    },
    [technicianId, mergeEmployeeProfile]
  );

  useEffect(() => {
    const fetchWorkerData = async () => {
      if (!workerId) {
        setLoading(false);
        return;
      }

      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          throw new Error("Supabase client not available");
        }

        const core = await fetchWorkerCoreByUserId(supabase, workerId);
        if (!core.userData) {
          toast.error("Worker not found");
          setLoading(false);
          return;
        }

        setTechnicianId(core.technicianId);
        setPersonalData(core.personalData);
        setContactData(core.contactData);
        setLoading(false);

        if (core.technicianId) {
          setEmployeeLoading(true);
          const profile = await fetchWorkerEmployeeSections(supabase, core.technicianId);
          mergeEmployeeProfile(profile);
          Object.keys(TAB_SECTION_MAP).forEach((key) => loadedSectionsRef.current.add(key));
          setEmployeeLoading(false);
        }
      } catch (error) {
        console.error("Error fetching worker data:", error);
        toast.error("Failed to load worker data");
        setLoading(false);
        setEmployeeLoading(false);
      }
    };

    loadedSectionsRef.current = new Set();
    fetchWorkerData();
  }, [workerId, mergeEmployeeProfile]);

  const handleTabChange = (key) => {
    if (HIDDEN_WORKER_EDIT_TABS.has(key)) return;
    setActiveTab(key);
    if (TAB_SECTION_MAP[key] && technicianId) {
      loadEmployeeSection(key, technicianId);
    }
  };

  const handlePersonalFormSubmit = async (personalFormData) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }

      let resolvedTechnicianId = technicianId;

      if (personalFormData.password && personalFormData.password.trim() !== "") {
        try {
          const supabaseAdmin = getSupabaseAdmin();
          const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
            workerId,
            { password: personalFormData.password }
          );

          if (passwordError) {
            console.error("Error updating password:", passwordError);
            toast.error("Failed to update password. Other information was saved.");
          }
        } catch (passwordUpdateError) {
          console.error("Error updating password:", passwordUpdateError);
        }
      }

      const newStatus = personalFormData.activeUser ? "ACTIVE" : "INACTIVE";
      const userUpdates = {
        username: personalFormData.email || personalData.email,
        role: personalFormData.isAdmin
          ? "ADMIN"
          : personalFormData.isFieldWorker
            ? "TECHNICIAN"
            : personalData.role || "TECHNICIAN",
        status: newStatus,
      };
      await userService.update(workerId, userUpdates);

      if (!resolvedTechnicianId) {
        const fullName =
          personalFormData.fullName ||
          `${personalFormData.firstName || ""} ${personalFormData.lastName || ""}`.trim() ||
          personalData.fullName ||
          personalData.email ||
          "New Technician";

        const { data: newTechnician, error: createError } = await supabase
          .from("technicians")
          .insert({
            user_id: workerId,
            email: personalFormData.email || personalData.email || "",
            full_name: fullName,
            first_name: personalFormData.firstName || null,
            middle_name: personalFormData.middleName || null,
            last_name: personalFormData.lastName || null,
            gender: personalFormData.gender ? personalFormData.gender.toUpperCase() : null,
            date_of_birth: personalFormData.dateOfBirth || null,
            bio: personalFormData.shortBio || null,
            avatar_url: personalFormData.profilePicture || null,
            status: newStatus,
            nric_fin_work_permit_number: personalFormData.nricFinWorkPermitNumber || null,
            work_permit_expiry_date: personalFormData.workPermitExpiryDate || null,
            job_incentive_hourly_rate: Number(personalFormData.jobIncentiveHourlyRate) || 0,
            sap_tech_code:
              (personalFormData.sapTechCode && String(personalFormData.sapTechCode).trim()) || null,
          })
          .select()
          .single();

        if (createError) {
          throw new Error(`Failed to create technician record: ${createError.message}`);
        }

        resolvedTechnicianId = newTechnician.id;
        setTechnicianId(newTechnician.id);
        loadedSectionsRef.current = new Set();

        invalidateWorkerCache(workerId);
        const refreshed = await fetchWorkerCoreByUserId(supabase, workerId);
        setPersonalData(refreshed.personalData);
        setContactData(refreshed.contactData);
      } else {
        const technicianUpdates = {
          first_name: personalFormData.firstName || null,
          middle_name: personalFormData.middleName || null,
          last_name: personalFormData.lastName || null,
          full_name:
            personalFormData.fullName ||
            `${personalFormData.firstName || ""} ${personalFormData.lastName || ""}`.trim() ||
            personalData.fullName,
          gender: personalFormData.gender ? personalFormData.gender.toUpperCase() : null,
          date_of_birth: personalFormData.dateOfBirth || null,
          bio: personalFormData.shortBio || null,
          avatar_url: personalFormData.profilePicture,
          email: personalFormData.email || personalData.email,
          status: newStatus,
          nric_fin_work_permit_number: personalFormData.nricFinWorkPermitNumber || null,
          work_permit_expiry_date: personalFormData.workPermitExpiryDate || null,
          job_incentive_hourly_rate: Number(personalFormData.jobIncentiveHourlyRate) || 0,
          sap_tech_code:
            (personalFormData.sapTechCode && String(personalFormData.sapTechCode).trim()) || null,
        };

        const { error: techError } = await supabase
          .from("technicians")
          .update(technicianUpdates)
          .eq("id", resolvedTechnicianId);

        if (techError) throw techError;
        invalidateWorkerCache(workerId);
      }

      toast.success("Personal information updated successfully!");
      void clientAuditLog({
        action: "WORKER_UPDATE",
        category: "worker",
        entityType: "worker",
        entityId: workerId,
        entityLabel: personalData.fullName || workerId,
        description: "Worker personal information updated",
        details: { section: "personal" },
      });
      handleTabChange("contact");
    } catch (error) {
      console.error("Error updating personal data:", error);
      toast.error("Failed to update personal information");
    }
  };

  const handleContactFormSubmit = async (contactFormData) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }

      let resolvedTechnicianId = technicianId;

      if (!resolvedTechnicianId) {
        const { data: newTechnician, error: createError } = await supabase
          .from("technicians")
          .insert({
            user_id: workerId,
            email: contactFormData.email || contactData.email || personalData.email || "",
            full_name: personalData.fullName || "New Technician",
            phone_number: contactFormData.primaryPhone || null,
            status: personalData.activeUser ? "ACTIVE" : "INACTIVE",
          })
          .select()
          .single();

        if (createError) {
          throw new Error(`Failed to create technician record: ${createError.message}`);
        }

        resolvedTechnicianId = newTechnician.id;
        setTechnicianId(newTechnician.id);
        loadedSectionsRef.current = new Set();

        invalidateWorkerCache(workerId);
        const refreshed = await fetchWorkerCoreByUserId(supabase, workerId);
        setPersonalData(refreshed.personalData);
        setContactData(refreshed.contactData);
      }

      const technicianUpdates = {
        phone_number: contactFormData.primaryPhone || null,
        primary_phone: contactFormData.primaryPhone || null,
        secondary_phone: contactFormData.secondaryPhone || null,
        active_phone_1: contactFormData.activePhone1 || false,
        active_phone_2: contactFormData.activePhone2 || false,
        street_address:
          contactFormData.streetAddress || contactFormData.address?.streetAddress || null,
        state_province:
          contactFormData.stateProvince || contactFormData.address?.stateProvince || null,
        zip_code:
          contactFormData.zipCode ||
          contactFormData.address?.postalCode ||
          contactFormData.address?.zipCode ||
          null,
        city: contactFormData.city || contactFormData.address?.city || null,
        country: contactFormData.country || contactFormData.address?.country || null,
        emergency_contact_name: contactFormData.emergencyContactName || null,
        emergency_contact_phone: contactFormData.emergencyContactPhone || null,
        emergency_relationship: contactFormData.emergencyRelationship || null,
      };

      const { error } = await supabase
        .from("technicians")
        .update(technicianUpdates)
        .eq("id", resolvedTechnicianId);

      if (error) throw error;
      invalidateWorkerCache(workerId);

      toast.success("Contact information updated successfully!");
      void clientAuditLog({
        action: "WORKER_UPDATE",
        category: "worker",
        entityType: "worker",
        entityId: workerId,
        entityLabel: contactFormData.email || workerId,
        description: "Worker contact information updated",
        details: { section: "contact" },
      });
      handleTabChange("schedule");
    } catch (error) {
      console.error("Error updating contact data:", error);
      toast.error("Failed to save contact data.");
    }
  };

  const saveProfileSection = async (sectionKey, tableName, values, nextTab) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }

      if (!technicianId) {
        throw new Error("Technician ID not found. Please save the Personal tab first.");
      }

      const savedData = await upsertTechnicianProfileSection(
        supabase,
        tableName,
        technicianId,
        values
      );
      setEmployeeProfile((prev) => ({ ...prev, [sectionKey]: savedData || values }));
      invalidateWorkerCache(workerId);
      toast.success("Worker information updated successfully!");
      void clientAuditLog({
        action: "WORKER_UPDATE",
        category: "worker",
        entityType: "worker",
        entityId: workerId,
        entityLabel: workerId,
        description: "Worker profile section updated",
        details: { section: sectionKey },
      });
      if (nextTab) handleTabChange(nextTab);
    } catch (error) {
      console.error("Error updating worker profile section:", error);
      toast.error("Failed to update worker information.");
      throw error;
    }
  };

  const handleEmploymentSubmit = (values) =>
    saveProfileSection("employment", TECHNICIAN_EMPLOYEE_TABLES.employment, values, "access");

  const handleAccessSubmit = (values) =>
    saveProfileSection("access", TECHNICIAN_EMPLOYEE_TABLES.access, values, "payroll");

  const handlePayrollSubmit = (values) =>
    saveProfileSection("payroll", TECHNICIAN_EMPLOYEE_TABLES.payroll, values, "schedule");

  const handleScheduleSubmit = async (scheduleData) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }
      if (!technicianId) {
        throw new Error("Technician ID not found. Please save the Personal tab first.");
      }

      const savedSchedule = await replaceTechnicianSchedule(supabase, technicianId, scheduleData);
      setEmployeeProfile((prev) => ({ ...prev, schedule: savedSchedule }));
      invalidateWorkerCache(workerId);
      toast.success("Schedule updated successfully!");
      handleTabChange("documents");
    } catch (error) {
      console.error("Error updating schedule:", error);
      toast.error("Failed to update schedule.");
    }
  };

  const handleDocumentUpload = async (documentData) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }
      if (!technicianId) {
        throw new Error("Technician ID not found. Please save the Personal tab first.");
      }

      const savedDocument = await createTechnicianDocument(supabase, technicianId, documentData);
      setEmployeeProfile((prev) => ({
        ...prev,
        documents: [savedDocument, ...(prev.documents || [])],
      }));
      invalidateWorkerCache(workerId);
      toast.success("Document saved.");
    } catch (error) {
      console.error("Error saving document:", error);
      toast.error("Failed to save document.");
    }
  };

  const handleDocumentDelete = async (documentId) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }
      await deleteTechnicianDocument(supabase, documentId);
      setEmployeeProfile((prev) => ({
        ...prev,
        documents: (prev.documents || []).filter((document) => document.id !== documentId),
      }));
      invalidateWorkerCache(workerId);
      toast.success("Document removed.");
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Unable to remove document.");
    }
  };

  const handleOtherSubmit = async (values) => {
    try {
      await saveProfileSection("other", TECHNICIAN_EMPLOYEE_TABLES.other, values, null);
      Swal.fire({
        title: "Success!",
        text: "Worker profile updated successfully.",
        icon: "success",
      }).then(() => {
        router.push("/workers");
      });
    } catch (error) {
      console.error("Error updating other details:", error);
      toast.error("Failed to update worker profile");
      Swal.fire({
        title: "Error!",
        text: "An error occurred while updating data.",
        icon: "error",
      });
    }
  };

  if (loading) {
    return (
      <Container>
        <Row className="justify-content-center">
          <Col>
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Loading...</span>
            </Spinner>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container>
      <Row>
        <Col xl={12} lg={12} md={12} sm={12}>
          <Card className="shadow-sm">
            <Card.Body>
              {employeeLoading && (
                <div className="text-muted small mb-2">Loading employee profile sections…</div>
              )}
              <Tabs activeKey={activeTab} onSelect={handleTabChange} className="mb-3">
                <Tab eventKey="personal" title="Personal">
                  <PersonalTab onSubmit={handlePersonalFormSubmit} initialValues={personalData} />
                </Tab>
                <Tab eventKey="contact" title="Contact">
                  <ContactTab onSubmit={handleContactFormSubmit} initialValues={contactData} />
                </Tab>
                {!HIDDEN_WORKER_EDIT_TABS.has('employment') && (
                  <Tab eventKey="employment" title="Employment">
                    <EmploymentTab
                      onSubmit={handleEmploymentSubmit}
                      initialValues={employeeProfile.employment}
                    />
                  </Tab>
                )}
                {!HIDDEN_WORKER_EDIT_TABS.has('access') && (
                  <Tab eventKey="access" title="Access">
                    <AccessTab onSubmit={handleAccessSubmit} initialValues={employeeProfile.access} />
                  </Tab>
                )}
                {!HIDDEN_WORKER_EDIT_TABS.has('payroll') && (
                  <Tab eventKey="payroll" title="Payroll">
                    <PayrollTab
                      onSubmit={handlePayrollSubmit}
                      initialValues={employeeProfile.payroll}
                      userId={Array.isArray(workerId) ? workerId[0] : workerId}
                    />
                  </Tab>
                )}
                <Tab eventKey="schedule" title="Schedule">
                  <EmployeeScheduleTab
                    onSubmit={handleScheduleSubmit}
                    initialValues={employeeProfile.schedule}
                  />
                </Tab>
                <Tab eventKey="documents" title="Documents">
                  <DocumentsTab
                    documents={employeeProfile.documents}
                    onUpload={handleDocumentUpload}
                    onDelete={handleDocumentDelete}
                    technicianId={technicianId}
                  />
                  <div className="d-flex justify-content-end mt-3">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleTabChange("other")}
                    >
                      Continue
                    </button>
                  </div>
                </Tab>
                <Tab eventKey="other" title="Other">
                  <OtherDetailsTab
                    onSubmit={handleOtherSubmit}
                    initialValues={employeeProfile.other}
                  />
                </Tab>
              </Tabs>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default EditWorker;
