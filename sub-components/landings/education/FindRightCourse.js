// import node module libraries
import { Col, Row, Container, Button, Image } from 'react-bootstrap';

const FindRightCourse = () => {
    return (
        <section className="pb-lg-10">
            <Container>
                <Row>
                    <Col xl={{ offset: 1, span: 10 }} md={12} xs={12}>
                        <div className="bg-primary py-6 px-6 px-xl-0 rounded-4 ">
                            <Row className="align-items-center">
                                <Col xl={{ offset: 1, span: 5 }} md={6} xs={12}>
                                    <div>
                                        <h2 className="h1 text-white mb-3">Let’s find the right course for you!</h2>
                                        <p className="text-white fs-4">…and achieve their learning goals. With our expert tutors, your goals are  closer  than ever!</p>
                                        <Button variant='dark'>Start learning</Button>
                                    </div>
                                </Col>
                                <Col xl={6} md={6} xs={12}>
                                    <div className="text-center">
                                        <Image src='/images/education/course.png' alt="learning" className="img-fluid" />
                                    </div>
                                </Col>
                            </Row>
                        </div>
                    </Col>
                </Row>
            </Container>
        </section>
    )
}

export default FindRightCourse