import React, { useState } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Tabs,
  Tab,
  Breadcrumb,
} from "react-bootstrap";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { userService } from "../../../lib/supabase/database";
import { getSupabaseAdmin } from "../../../lib/supabase/server";
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
import { toast, ToastContainer } from "react-toastify";
import { useRouter } from "next/router";
import Swal from "sweetalert2";
import { GeeksSEO } from "widgets";
import Link from 'next/link';
import { clientAuditLog } from "../../../utils/clientAuditLog";

const CreateWorker = () => {
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
  const [isPersonalTabComplete, setIsPersonalTabComplete] = useState(false);
  const [isContactTabComplete, setIsContactTabComplete] = useState(false);
  const [isEmploymentTabComplete, setIsEmploymentTabComplete] = useState(false);
  const [isAccessTabComplete, setIsAccessTabComplete] = useState(false);
  const [isPayrollTabComplete, setIsPayrollTabComplete] = useState(false);
  const [isScheduleTabComplete, setIsScheduleTabComplete] = useState(false);
  const [isDocumentsTabComplete, setIsDocumentsTabComplete] = useState(false);
  const router = useRouter();

  const handleTabChange = (key) => {
    setActiveTab(key);
  };

  const logActivity = async (activity, activitybrief) => {
    try {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin
        .from('recent_activities')
        .insert({
          action: activity,
          details: { brief: activitybrief },
          type: 'worker_management'
        });
    } catch (error) {
      console.error("Error logging activity:", error);
    }
  };

  const handlePersonalFormSubmit = async (personalFormData) => {
    // Validation: Check for required fields
    if (
      !personalFormData.email ||
      !personalFormData.password ||
      (!personalFormData.fullName && (!personalFormData.firstName || !personalFormData.lastName))
    ) {
      toast.error("Please fill in all required personal fields (Email, Password, and Name).");
      return; // Stop execution if validation fails
    }

    try {
      const { 
        email, 
        password, 
        fullName,
        firstName,
        middleName,
        lastName,
        gender,
        dateOfBirth,
        profilePicture,
        activeUser,
        isAdmin,
        isFieldWorker,
        shortBio
      } = personalFormData;

      // Determine role based on flags
      let role = 'TECHNICIAN';
      if (isAdmin) {
        role = 'ADMIN';
      } else if (isFieldWorker) {
        role = 'TECHNICIAN';
      }

      // Determine status
      const status = activeUser ? 'ACTIVE' : 'INACTIVE';

      // Get Supabase admin client for auth operations
      const supabaseAdmin = getSupabaseAdmin();

      // Check if user already exists in Supabase Auth
      const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingAuthUser = existingAuthUsers?.users?.find(u => u.email === email);

      if (existingAuthUser) {
        toast.error("A user with this email already exists.");
        return;
      }

      // Check if user exists in custom users table
      const supabase = getSupabaseClient();
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, username')
        .eq('username', email)
        .is('deleted_at', null)
        .single();

      if (existingUser) {
        toast.error("A user with this email already exists in the system.");
        return;
      }

      // Build full name for user metadata
      const finalFullName = fullName || 
        `${firstName || ''} ${middleName || ''} ${lastName || ''}`.trim() || 
        email;

      // Create user in Supabase Auth (auth.users) - password stored here
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Auto-confirm email for admin-created users
        user_metadata: {
          role: role,
          full_name: finalFullName
        }
      });

      if (authError) {
        throw authError;
      }

      // Create user record in custom users table (linked to auth user)
      let user;
      try {
        user = await userService.create({
          id: authUser.user.id, // Use auth user ID
          username: email,
          role: role,
          status: status
        });
      } catch (userError) {
        // If user creation fails, clean up the auth user
        try {
          await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        } catch (deleteError) {
          console.error("Error cleaning up auth user after user creation failure:", deleteError);
        }
        throw userError;
      }

      // Create technician record linked to user
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      const { data: technician, error: techError } = await supabase
        .from('technicians')
        .insert({
          user_id: user.id,
          email: email,
          full_name: finalFullName,
          first_name: firstName || null,
          middle_name: middleName || null,
          last_name: lastName || null,
          gender: gender ? gender.toUpperCase() : null,
          date_of_birth: dateOfBirth || null,
          avatar_url: profilePicture || null,
          bio: shortBio || null,
          phone_number: null, // Will be updated in contact tab
          status: status,
          nric_fin_work_permit_number: personalFormData.nricFinWorkPermitNumber || null,
          work_permit_expiry_date: personalFormData.workPermitExpiryDate || null
        })
        .select()
        .single();

      if (techError) {
        // If technician creation fails, try to delete the user and auth user
        try {
          await userService.delete(user.id);
          await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        } catch (deleteError) {
          console.error("Error cleaning up user after technician creation failure:", deleteError);
        }
        throw techError;
      }

      const userData = {
        id: user.id,
        technicianId: technician.id,
        ...personalFormData,
      };

      setPersonalData(userData);
      setIsPersonalTabComplete(true); // Mark personal tab as complete
      toast.success("Personal information saved! Please continue with contact information.");
      handleTabChange("contact"); // Move to contact tab
    } catch (error) {
      console.error("Error creating user:", error);
      toast.error("Error creating user: " + (error.message || "Unknown error"));
    }
  };

  const handleContactFormSubmit = async (contactFormData) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      if (!personalData.technicianId) {
        throw new Error('Technician ID not found. Please complete the Personal tab first.');
      }

      // Update technician record with contact information
      const contactUpdates = {
        phone_number: contactFormData.primaryPhone || null,
        primary_phone: contactFormData.primaryPhone || null,
        secondary_phone: contactFormData.secondaryPhone || null,
        active_phone_1: contactFormData.activePhone1 || false,
        active_phone_2: contactFormData.activePhone2 || false,
        street_address: contactFormData.address?.streetAddress || null,
        state_province: contactFormData.address?.stateProvince || null,
        zip_code: contactFormData.address?.postalCode || contactFormData.address?.zipCode || null,
        emergency_contact_name: contactFormData.emergencyContactName || null,
        emergency_contact_phone: contactFormData.emergencyContactPhone || null,
        emergency_relationship: contactFormData.emergencyRelationship || null,
      };

      const { error: updateError } = await supabase
        .from('technicians')
        .update(contactUpdates)
        .eq('id', personalData.technicianId);

      if (updateError) {
        throw updateError;
      }

      setContactData({ ...contactFormData });
      setIsContactTabComplete(true); // Mark contact tab as complete
      toast.success("Contact information saved! Please continue with documents.");
      handleTabChange("documents"); // Skip hidden optional tabs (employment, access, payroll, schedule)
    } catch (error) {
      console.error("Error saving contact data:", error);
      toast.error("Error saving contact data: " + (error.message || "Unknown error"));
    }
  };

  const saveProfileSection = async (sectionKey, tableName, values, nextTab, completeSetter) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      if (!personalData.technicianId) {
        throw new Error('Technician ID not found. Please complete the Personal tab first.');
      }

      const savedData = await upsertTechnicianProfileSection(
        supabase,
        tableName,
        personalData.technicianId,
        values
      );

      setEmployeeProfile((prev) => ({ ...prev, [sectionKey]: savedData || values }));
      completeSetter(true);
      toast.success("Worker information saved.");
      if (nextTab) handleTabChange(nextTab);
    } catch (error) {
      console.error("Error saving worker profile section:", error);
      toast.error("An error occurred while saving data: " + (error.message || "Unknown error"));
    }
  };

  const handleEmploymentSubmit = (values) =>
    saveProfileSection("employment", TECHNICIAN_EMPLOYEE_TABLES.employment, values, "access", setIsEmploymentTabComplete);

  const handleAccessSubmit = (values) =>
    saveProfileSection("access", TECHNICIAN_EMPLOYEE_TABLES.access, values, "payroll", setIsAccessTabComplete);

  const handlePayrollSubmit = (values) =>
    saveProfileSection("payroll", TECHNICIAN_EMPLOYEE_TABLES.payroll, values, "schedule", setIsPayrollTabComplete);

  const handleScheduleSubmit = async (scheduleData) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }
      if (!personalData.technicianId) {
        throw new Error('Technician ID not found. Please complete the Personal tab first.');
      }

      const savedSchedule = await replaceTechnicianSchedule(supabase, personalData.technicianId, scheduleData);
      setEmployeeProfile((prev) => ({ ...prev, schedule: savedSchedule }));
      setIsScheduleTabComplete(true);
      toast.success("Schedule saved! Please continue with documents.");
      handleTabChange("documents");
    } catch (error) {
      console.error("Error saving schedule:", error);
      toast.error("An error occurred while saving schedule: " + (error.message || "Unknown error"));
    }
  };

  const handleDocumentUpload = async (documentData) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }
      if (!personalData.technicianId) {
        throw new Error('Technician ID not found. Please complete the Personal tab first.');
      }

      const savedDocument = await createTechnicianDocument(supabase, personalData.technicianId, documentData);
      setEmployeeProfile((prev) => ({
        ...prev,
        documents: [savedDocument, ...(prev.documents || [])],
      }));
      setIsDocumentsTabComplete(true);
      toast.success("Document saved.");
    } catch (error) {
      console.error("Error saving document:", error);
      toast.error("An error occurred while saving document: " + (error.message || "Unknown error"));
    }
  };

  const handleDocumentDelete = async (documentId) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }
      await deleteTechnicianDocument(supabase, documentId);
      setEmployeeProfile((prev) => ({
        ...prev,
        documents: (prev.documents || []).filter((document) => document.id !== documentId),
      }));
      toast.success("Document removed.");
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Unable to remove document.");
    }
  };

  const handleDocumentsContinue = () => {
    setIsDocumentsTabComplete(true);
    handleTabChange("other");
  };

  const handleOtherSubmit = async (values) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }
      if (!personalData.technicianId) {
        throw new Error('Technician ID not found. Please complete the Personal tab first.');
      }

      const savedOther = await upsertTechnicianProfileSection(
        supabase,
        TECHNICIAN_EMPLOYEE_TABLES.other,
        personalData.technicianId,
        values
      );
      setEmployeeProfile((prev) => ({ ...prev, other: savedOther || values }));

      // Get the full name for activity log
      const workerName = personalData.fullName || 
        `${personalData.firstName || ''} ${personalData.lastName || ''}`.trim() || 
        personalData.email;

      // Log this activity
      await logActivity(
        "Worker Created",
        `${workerName} has been added as a worker.`
      );

      // Use SweetAlert for confirmation dialog
      Swal.fire({
        title: "Success!",
        text: "Worker profile created successfully. Click OK to continue.",
        icon: "success",
        confirmButtonText: "OK",
      }).then((result) => {
        if (result.isConfirmed) {
          // Redirect to workers list
          router.push('/workers');
        }
      });

      toast.success("Worker created successfully!");
      void clientAuditLog({
        action: 'WORKER_CREATE',
        category: 'worker',
        entityType: 'worker',
        entityId: personalData.technicianId || personalData.id,
        entityLabel: workerName,
        description: `Worker ${workerName} created`,
        details: { technician_id: personalData.technicianId, user_id: personalData.id },
      });
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("An error occurred while saving data: " + (error.message || "Unknown error"));
    }
  };

  return (
    <Container>
      <GeeksSEO title="Add Worker | SAS&ME - SAP B1 | Portal" />
      <Tab.Container defaultActiveKey="add">
        <Row>
          <Col lg={12} md={12} sm={12}>
            <div 
              style={{
                background: "linear-gradient(90deg, #4171F5 0%, #3DAAF5 100%)",
                padding: "1.5rem 2rem",
                borderRadius: "0 0 24px 24px",
                marginTop: "-39px",
                marginLeft: "10px",
                marginRight: "10px",
                marginBottom: "20px",
              }}
            >
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
                      Create New Worker
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
                      Add a new worker to your team by filling out their profile, schedule, payroll, and document information
                    </p>
                    <div
                      className="d-flex align-items-center gap-2"
                      style={{
                        fontSize: "14px",
                        color: "rgba(255, 255, 255, 0.9)",
                        background: "rgba(255, 255, 255, 0.1)",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        marginTop: "8px",
                      }}
                    >
                      <i className="fe fe-info" style={{ fontSize: "16px" }}></i>
                      <span>
                        Complete all required fields across the worker profile tabs.
                      </span>
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-2 mb-4">
                    <span
                      className="badge"
                      style={{
                        background: "#FFFFFF",
                        color: "#4171F5",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontWeight: "500",
                        fontSize: "14px",
                      }}
                    >
                      Worker Management
                    </span>
                    <span
                      className="badge"
                      style={{
                        background: "rgba(255, 255, 255, 0.2)",
                        color: "#FFFFFF",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontWeight: "500",
                        fontSize: "14px",
                      }}
                    >
                      <i className="fe fe-user-plus me-1"></i>
                      New Worker
                    </span>
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
                        href="/"
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
                        href="/workers"
                        className="text-decoration-none d-flex align-items-center"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        <i className="fe fe-users me-1"></i>
                        Workers
                      </Link>
                      <span
                        className="mx-2"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        /
                      </span>
                      <span style={{ color: "#FFFFFF" }}>
                        <i className="fe fe-user-plus me-1"></i>
                        Create Worker
                      </span>
                    </div>
                  </nav>
                </div>

                <div>
                  <Link 
                    href="/workers"
                    className="btn btn-light btn-sm d-flex align-items-center gap-2"
                    style={{
                      border: "none",
                      borderRadius: "12px",
                      padding: "10px 20px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      transition: "all 0.2s ease",
                      fontWeight: "500",
                      boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    <i className="fe fe-arrow-left"></i>
                    Back to Workers
                  </Link>
                </div>
              </div>
            </div>
          </Col>
        </Row>

        <Tab.Content>
          <Tab.Pane eventKey="add" className="pb-4 tab-pane-custom-margin">
            <ToastContainer
              position="top-right"
              autoClose={2000}
              hideProgressBar={false}
              newestOnTop={false}
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="colored"
            />
            <Row>
              <Col xl={12} lg={12} md={12} sm={12}>
                <Card className="shadow-sm">
                  <Card.Body>
                    <Tabs
                      activeKey={activeTab}
                      onSelect={handleTabChange}
                      className="mb-3"
                    >
                      <Tab eventKey="personal" title="Personal">
                        <PersonalTab
                          onSubmit={handlePersonalFormSubmit}
                          disabled={false} // Always enabled
                        />
                      </Tab>
                      <Tab
                        eventKey="contact"
                        title="Contact"
                        disabled={!isPersonalTabComplete}
                      >
                        <ContactTab
                          onSubmit={handleContactFormSubmit}
                          disabled={!isPersonalTabComplete} // Disable if personal tab is not complete
                        />
                      </Tab>
                      {/* <Tab
                        eventKey="employment"
                        title="Employment"
                        disabled={!isContactTabComplete}
                      >
                        <EmploymentTab
                          onSubmit={handleEmploymentSubmit}
                          initialValues={employeeProfile.employment}
                          disabled={!isContactTabComplete}
                        />
                      </Tab>
                      <Tab
                        eventKey="access"
                        title="Access"
                        disabled={!isEmploymentTabComplete}
                      >
                        <AccessTab
                          onSubmit={handleAccessSubmit}
                          initialValues={employeeProfile.access}
                          disabled={!isEmploymentTabComplete}
                        />
                      </Tab>
                      <Tab
                        eventKey="payroll"
                        title="Payroll"
                        disabled={!isAccessTabComplete}
                      >
                        <PayrollTab
                          onSubmit={handlePayrollSubmit}
                          initialValues={employeeProfile.payroll}
                          userId={personalData.id}
                          disabled={!isAccessTabComplete}
                        />
                      </Tab>
                      <Tab
                        eventKey="schedule"
                        title="Schedule"
                        disabled={!isPayrollTabComplete}
                      >
                        <EmployeeScheduleTab
                          onSubmit={handleScheduleSubmit}
                          initialValues={employeeProfile.schedule}
                          disabled={!isPayrollTabComplete}
                        />
                      </Tab> */}
                      <Tab
                        eventKey="documents"
                        title="Documents"
                        disabled={!isContactTabComplete}
                      >
                        <DocumentsTab
                          documents={employeeProfile.documents}
                          onUpload={handleDocumentUpload}
                          onDelete={handleDocumentDelete}
                          technicianId={personalData.technicianId}
                          disabled={!isContactTabComplete}
                        />
                        <div className="d-flex justify-content-end mt-3">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleDocumentsContinue}
                            disabled={!isContactTabComplete}
                          >
                            Continue
                          </button>
                        </div>
                      </Tab>
                      <Tab
                        eventKey="other"
                        title="Other"
                        disabled={!isDocumentsTabComplete}
                      >
                        <OtherDetailsTab
                          onSubmit={handleOtherSubmit}
                          initialValues={employeeProfile.other}
                          disabled={!isDocumentsTabComplete}
                        />
                      </Tab>
                    </Tabs>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
      <style jsx global>{`
        .breadcrumb-link {
          transition: all 0.2s ease-in-out;
        }
        
        .breadcrumb-link:hover {
          color: #ffffff !important;
          transform: translateY(-1px);
          text-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
        }

        .badge {
          font-weight: 500;
          padding: 0.35em 0.8em;
          font-size: 0.75rem;
          border-radius: 6px;
        }
      `}</style>
    </Container>
  );
};

export default CreateWorker;