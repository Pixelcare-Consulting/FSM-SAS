import { useEffect } from "react";
import { useRouter } from "next/router";
import Cookies from "js-cookie";
import { Spinner, Container, Row, Col } from "react-bootstrap";

const MyProfile = () => {
  const router = useRouter();

  useEffect(() => {
    // Get current user's UID from cookies
    const uid = Cookies.get("uid");
    const workerId = Cookies.get("workerId");

    if (uid || workerId) {
      // Redirect to the profile page with the user's ID
      router.replace(`/dashboard/profile/${uid || workerId}`);
    } else {
      // If no UID, try to get user info from API
      fetch("/api/getUserInfo", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.user?.uid) {
            router.replace(`/dashboard/profile/${data.user.uid}`);
          } else {
            router.push("/sign-in");
          }
        })
        .catch(() => {
          router.push("/sign-in");
        });
    }
  }, [router]);

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

