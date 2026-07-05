// import node module libraries
import { Fragment } from 'react';
import { Col, Row, Card, Form, Button, Image } from 'react-bootstrap';
import Link from 'next/link';

// import widget/custom components
import { GeeksSEO } from 'widgets'; 

// import authlayout to override default layout 
import AuthLayout from 'layouts/dashboard/AuthLayout';

const ForgetPassword = () => {
	return (
        <Fragment>
			{/* Geeks SEO settings  */}
			<GeeksSEO title="Forget Password | Geeks Nextjs Template" />

			<Row className="align-items-center justify-content-center g-0 min-vh-100">
				<Col lg={5} md={5} className="py-8 py-xl-0">
					<Card>
						<Card.Body className="p-6">
							<div className="mb-4">
								<Link href="/">
									<Image src="/images/brand/logo/logo-icon.svg" className="mb-4" alt="" />
								</Link>
								<h1 className="mb-1 fw-bold">Forgot Password</h1>
								<span>Fill the form to reset your password.</span>
							</div>
							{/* Form */}
							<Form>
								<Row>
									<Col lg={12} md={12} className="mb-3">
										{/*  email */}
										<Form.Label>Email</Form.Label>
										<Form.Control
											type="email"
											id="email"
											placeholder="Enter your email"
											required
										/>
									</Col>
									<Col lg={12} md={12} className="mb-3 d-grid gap-2">
										{/* Button */}
										<Button variant="primary" type="submit">
											Send Reset Link
										</Button>
									</Col>
								</Row>
								<span>
									Return to <Link href="/sign-in">Sign in</Link>
								</span>
							</Form>
						</Card.Body>
					</Card>
				</Col>
			</Row>
		</Fragment>
    );
};

ForgetPassword.Layout = AuthLayout;

export default ForgetPassword;
