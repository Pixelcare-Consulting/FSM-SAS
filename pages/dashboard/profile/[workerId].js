import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { Container, Row, Col, Card, Tabs, Tab, Spinner } from "react-bootstrap";
import { useRouter } from "next/router";
import { EditPersonalTab } from "sub-components/dashboard/profile/EditPersonalTab";
import { EditContactTab } from "sub-components/dashboard/profile/EditContactTab";
import { userService } from "../../../lib/supabase/database";
import { getSupabaseClient } from "../../../lib/supabase/client";
import toast from "react-hot-toast";

const EditProfile = () => {
  const router = useRouter();
  const { workerId, tab } = router.query; // Get the workerId and tab query param
  const [activeTab, setActiveTab] = useState("personal");
  const [personalData, setPersonalData] = useState({});
  const [contactData, setContactData] = useState({});
  // const [skillsData, setSkillsData] = useState({});
  const [loading, setLoading] = useState(true);

  // State to hold all submitted data
  const [submittedData, setSubmittedData] = useState({});

  useEffect(() => {
    const fetchWorkerData = async () => {
      console.log("Fetching data for Worker ID:", workerId);
      if (workerId) {
        try {
          // Fetch user data from Supabase
          const userData = await userService.findById(workerId);
          
          if (userData) {
            const technician = userData.technicians?.[0] || userData.technicians;
            
            console.log("📊 Fetched user data:", {
              userData: {
                id: userData.id,
                username: userData.username,
                role: userData.role,
                status: userData.status
              },
              technician: technician ? {
                id: technician.id,
                first_name: technician.first_name,
                last_name: technician.last_name,
                email: technician.email,
                phone_number: technician.phone_number,
                primary_phone: technician.primary_phone,
                avatar_url: technician.avatar_url
              } : null
            });
            
            // Format date of birth for HTML date input (YYYY-MM-DD)
            let formattedDateOfBirth = "";
            if (technician?.date_of_birth) {
              const dob = new Date(technician.date_of_birth);
              if (!isNaN(dob.getTime())) {
                formattedDateOfBirth = dob.toISOString().split('T')[0];
              }
            }

            // Map contact data - check both phone_number and primary_phone fields
            const contactDataMapped = {
              primaryPhone: technician?.primary_phone || technician?.phone_number || "",
              secondaryPhone: technician?.secondary_phone || "",
              activePhone1: technician?.active_phone_1 || false,
              activePhone2: technician?.active_phone_2 || false,
              email: userData.username || technician?.email || "",
              stateProvince: technician?.state_province || "",
              streetAddress: technician?.street_address || "",
              zipCode: technician?.zip_code || technician?.postal_code || "",
              emergencyContactName: technician?.emergency_contact_name || "",
              emergencyContactPhone: technician?.emergency_contact_phone || "",
              emergencyRelationship: technician?.emergency_relationship || "",
            };
            
            console.log("📋 Mapped contact data:", contactDataMapped);
            setContactData(contactDataMapped);
            
            // Format work permit expiry date for HTML date input (YYYY-MM-DD)
            let formattedWorkPermitExpiryDate = "";
            if (technician?.work_permit_expiry_date) {
              const wpExpDate = new Date(technician.work_permit_expiry_date);
              if (!isNaN(wpExpDate.getTime())) {
                formattedWorkPermitExpiryDate = wpExpDate.toISOString().split('T')[0];
              }
            }

            const personalDataMapped = {
              profilePicture: technician?.avatar_url || "/images/avatar/NoProfile.png",
              firstName: technician?.first_name || "",
              middleName: technician?.middle_name || "",
              lastName: technician?.last_name || "",
              gender: technician?.gender?.toLowerCase() || "",
              dateOfBirth: formattedDateOfBirth,
              email: userData.username || technician?.email || "",
              workerId: technician?.id || userData.id || "",
              password: "", // Don't populate password
              shortBio: technician?.bio || "",
              isAdmin: userData.role === "ADMIN",
              isFieldWorker: userData.role === "TECHNICIAN",
              nricFinWorkPermitNumber: technician?.nric_fin_work_permit_number || "",
              workPermitExpiryDate: formattedWorkPermitExpiryDate,
            };
            
            console.log("📋 Mapped personal data:", personalDataMapped);
            setPersonalData(personalDataMapped);
          } else {
            console.log("No worker found with the provided ID.");
            toast.error("User not found");
          }
        } catch (error) {
          console.error("Error fetching worker data:", error);
          toast.error("Failed to load profile data");
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    fetchWorkerData();
  }, [workerId]);

  const handleTabChange = (key) => {
    setActiveTab(key);
  };

  useEffect(() => {
    if (tab) {
      setActiveTab(tab); // Set the active tab to the one passed in the query (e.g., 'contact')
    }
  }, [tab]);

  const handlePersonalFormSubmit = async (personalFormData) => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }

      // Get current user data to find technician record
      const userData = await userService.findById(workerId);
      let technician = userData.technicians?.[0] || userData.technicians;
      let technicianId = technician?.id;

      // Update user record (profile_picture doesn't exist in users table, only in technicians table)
      const userUpdates = {
        username: personalFormData.email,
        role: personalFormData.isAdmin ? "ADMIN" : (personalFormData.isFieldWorker ? "TECHNICIAN" : userData.role),
      };
      await userService.update(workerId, userUpdates);

      // If technician record doesn't exist, create it
      if (!technicianId) {
        console.log("⚠️ Technician record not found, creating one...");
        const fullName = personalFormData.fullName || 
          `${personalFormData.firstName || ''} ${personalFormData.lastName || ''}`.trim() || 
          userData.username || 'New Technician';
        
        const { data: newTechnician, error: createError } = await supabase
          .from('technicians')
          .insert({
            user_id: workerId,
            email: personalFormData.email || userData.username || '',
            full_name: fullName,
            first_name: personalFormData.firstName || null,
            middle_name: personalFormData.middleName || null,
            last_name: personalFormData.lastName || null,
            gender: personalFormData.gender ? personalFormData.gender.toUpperCase() : null,
            date_of_birth: personalFormData.dateOfBirth || null,
            bio: personalFormData.shortBio || null,
            avatar_url: personalFormData.profilePicture || null,
            status: userData.status || 'ACTIVE',
            nric_fin_work_permit_number: personalFormData.nricFinWorkPermitNumber || null,
            work_permit_expiry_date: personalFormData.workPermitExpiryDate || null
          })
          .select()
          .single();

        if (createError) {
          console.error("Error creating technician record:", createError);
          throw new Error(`Failed to create technician record: ${createError.message}`);
        }

        technician = newTechnician;
        technicianId = newTechnician.id;
        console.log("✅ Technician record created:", technicianId);
      } else {
        // Update existing technician record
        const technicianUpdates = {
          first_name: personalFormData.firstName,
          middle_name: personalFormData.middleName || null,
          last_name: personalFormData.lastName,
          gender: personalFormData.gender ? personalFormData.gender.toUpperCase() : null,
          date_of_birth: personalFormData.dateOfBirth || null,
          bio: personalFormData.shortBio || null,
          avatar_url: personalFormData.profilePicture,
          nric_fin_work_permit_number: personalFormData.nricFinWorkPermitNumber || null,
          work_permit_expiry_date: personalFormData.workPermitExpiryDate || null
        };

        const { error: techError } = await supabase
          .from('technicians')
          .update(technicianUpdates)
          .eq('id', technicianId);

        if (techError) {
          console.error("Error updating technician:", techError);
          throw techError;
        }
      }

      setSubmittedData((prevData) => ({
        ...prevData,
        personal: personalFormData,
      }));

      toast.success("Personal information updated successfully!");
      handleTabChange("contact");
    } catch (error) {
      console.error("Error updating personal data:", error);
      toast.error("Failed to update personal information");
    }
  };

  const handleContactFormSubmit = async (contactFormData) => {
    console.log("Submitting contact form data:", contactFormData);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }

      // Get current user data to find technician record
      const userData = await userService.findById(workerId);
      let technician = userData.technicians?.[0] || userData.technicians;
      let technicianId = technician?.id;

      // If technician record doesn't exist, create it
      if (!technicianId) {
        console.log("⚠️ Technician record not found, creating one...");
        const { data: newTechnician, error: createError } = await supabase
          .from('technicians')
          .insert({
            user_id: workerId,
            email: userData.username || contactFormData.email || '',
            full_name: userData.username || 'New Technician',
            phone_number: contactFormData.primaryPhone || null,
            status: userData.status || 'ACTIVE'
          })
          .select()
          .single();

        if (createError) {
          console.error("Error creating technician record:", createError);
          throw new Error(`Failed to create technician record: ${createError.message}`);
        }

        technician = newTechnician;
        technicianId = newTechnician.id;
        console.log("✅ Technician record created:", technicianId);
      }

      // Update technician record with contact information
      const technicianUpdates = {
        primary_phone: contactFormData.primaryPhone || null,
        secondary_phone: contactFormData.secondaryPhone || null,
        active_phone_1: contactFormData.activePhone1 || false,
        active_phone_2: contactFormData.activePhone2 || false,
        street_address: contactFormData.streetAddress || null,
        state_province: contactFormData.stateProvince || null,
        zip_code: contactFormData.zipCode || null,
        emergency_contact_name: contactFormData.emergencyContactName || null,
        emergency_contact_phone: contactFormData.emergencyContactPhone || null,
        emergency_relationship: contactFormData.emergencyRelationship || null,
      };

      const { error } = await supabase
        .from('technicians')
        .update(technicianUpdates)
        .eq('id', technicianId);

      if (error) {
        console.error("Error updating contact data:", error);
        throw error;
      }

      console.log("Contact data saved successfully.");
      toast.success("Contact information updated successfully!");
      
      // Show success message and redirect
      Swal.fire({
        title: "Success!",
        text: "Profile updated successfully.",
        icon: "success",
      });
    } catch (error) {
      console.error("Error updating contact data:", error);
      toast.error("Failed to save contact data.");
    }
  };

  // Removed handleSkillsFormSubmit as skills tab is commented out

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
              <Tabs
                activeKey={activeTab}
                onSelect={handleTabChange}
                className="mb-3"
              >
                <Tab eventKey="personal" title="Personal">
                  {Object.keys(personalData).length > 0 ? (
                    <EditPersonalTab
                      onSubmit={handlePersonalFormSubmit}
                      initialValues={personalData}
                    />
                  ) : (
                    <div>Loading personal data...</div>
                  )}
                </Tab>
                <Tab eventKey="contact" title="Address">
                  {Object.keys(contactData).length > 0 ? (
                    <EditContactTab
                      onSubmit={handleContactFormSubmit}
                      initialValues={contactData}
                    />
                  ) : (
                    <div>Loading contact data...</div>
                  )}
                </Tab>
                {/* <Tab eventKey="skills" title="Skills">
                  <SkillsTab
                    onSubmit={handleSkillsFormSubmit}
                    initialValues={skillsData}
                  />
                </Tab> */}
              </Tabs>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default EditProfile;

// getStaticProps to generate static pages
export const getStaticProps = async ({ params }) => {
  const workerId = params.workerId;
  return {
    props: {
      workerId, // Pass the workerId as a prop
    },
  };
};

// getStaticPaths to pre-generate pages based on worker data
export const getStaticPaths = async () => {
  const paths = [];

  return {
    paths,
    fallback: "blocking", // Generate pages dynamically if not pre-rendered
  };
};
