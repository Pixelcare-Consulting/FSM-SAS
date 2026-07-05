// Section : Image Gallery Section
// Style : Justified with round images

// import node module libraries
import { Image } from 'react-bootstrap';

const JustifiedGallery = () => {
	const GalleryImages = [
		{
			id: 1,
			image: '/images/about/geeksui-img-1.jpg'
		},
		{
			id: 2,
			image: '/images/about/geeksui-img-2.jpg'
		},
		{
			id: 3,
			image: '/images/about/geeksui-img-3.jpg'
		},
		{
			id: 4,
			image: '/images/about/geeksui-img-4.jpg'
		},
		{
			id: 5,
			image: '/images/about/geeksui-img-5.jpg'
		},
		{
			id: 6,
			image: '/images/about/geeksui-img-6.jpg'
		}
	];
	return (
		<section className="gallery mb-12">
			{GalleryImages.map((item, index) => {
				return (
					<figure
						className={`gallery__item gallery__item--${item.id} mb-0`}
						key={index}
					>
						<Image
							src={item.image}
							alt="Gallery image 1"
							className="gallery__img rounded-3"
						/>
					</figure>
				);
			})}
		</section>
	);
};

export default JustifiedGallery;
