// import node module libraries
import { Col, Row, Container, Image } from 'react-bootstrap';
import Link from 'next/link';

const BecomeAnInstructor = () => {
  return (
    <section className="py-lg-14 pb-8 bg-white">
    <Container className="bg-primary rounded-3">
      <Row className="align-items-center">
        <Col lg={6} xs={12} className="d-none d-lg-block">
          <div className="d-flex justify-content-center ">
            <div className="position-relative">
              <Image src='/images/png/cta-instructor-1.png' alt="" className="img-fluid mt-n13"/>
              <div className="ms-n12 position-absolute bottom-0 start-0 mb-6">
                <Image src='/images/svg/dollor.svg' alt=""/>
              </div>
              <div className="me-n4 position-absolute top-0 end-0">
                <Image src='/images/svg/graph.svg' alt=""/>
              </div>
            </div>
          </div>
        </Col>
        <Col lg={5} xs={12}>
          <div className="text-white p-5 p-lg-0">
            <h2 className="h1 text-white">Become an instructor today</h2>
            <p className="mb-0">Instructors from around the world teach millions of students on Geeks. We provide the tools
              and skills to teach what you love.</p>
            <Link href="#" className="btn btn-white mt-4">Start Teaching Today</Link>
          </div>
        </Col>
      </Row>
    </Container>
  </section>
  )
}

export default BecomeAnInstructor