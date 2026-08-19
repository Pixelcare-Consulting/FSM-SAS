import { useEffect } from "react";
import { useRouter } from "next/router";
import { Spinner, Container, Row, Col } from "react-bootstrap";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// Hidden from account dropdown until Profile is re-enabled
export const ACCOUNT_PROFILE_ENABLED = false;

const MyProfile = () => {
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();

  useEffect(() => {
    // Hidden from account dropdown until Profile is re-enabled
    if (!ACCOUNT_PROFILE_ENABLED) {
      router.replace("/dashboard");
      return;
    }

    const profileId = user?.workerId || user?.uid || user?.id;
    if (profileId) {
      router.replace(`/dashboard/profile/${profileId}`);
      return;
    }

    if (!isLoading && !user) {
      router.push("/sign-in");
    }
  }, [router, user, isLoading]);

  if (!ACCOUNT_PROFILE_ENABLED) {
    return null;
  }

  return (
    <Container>
      <Row className="justify-content-center mt-5">
        <Col xs="auto">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading profile...</span>
          </Spinner>
        </Col>
      </Row>
    </Container>
  );
};

export default MyProfile;
