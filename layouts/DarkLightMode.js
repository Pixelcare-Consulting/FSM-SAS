// import node module libraries
import Link from 'next/link'
import { Fragment, useEffect, useState } from 'react'
import { Form, Image } from 'react-bootstrap'
import { useSelector, useDispatch } from 'react-redux'

// import chat actions from Redux chatSlice
import { changeSkin } from 'store/appSlice'

// import required hook
import useLocalStorage from "hooks/useLocalStorage";

const DarkLightMode = ({ className }) => {

    // Redux state and dispatch
    const defaultSkin = useSelector((state) => state.app.skin)
    const dispatch = useDispatch()

    // setting default icon based on skin which is configured in redux app config
    const [imageSrc, setImageSrc] = useState(defaultSkin === "dark" ? '/images/svg/moon.svg' : '/images/svg/sun.svg');

    const {
        storageValue,
        setStorageValue,
        getStorageValue
    } = useLocalStorage("skin", defaultSkin);

    useEffect(() => {
        document.querySelector('html').setAttribute('data-theme', getStorageValue('skin', 'light'));
        dispatch(changeSkin(storageValue));
        setImageSrc(storageValue === 'dark' ? '/images/svg/moon.svg' : '/images/svg/sun.svg');
    }, [storageValue]);

    const changeColorMode = () => {
        setStorageValue(storageValue === "light" ? "dark" : "light");
        dispatch(changeSkin(storageValue));
    }
    return (
        <Fragment>
            <Link href="#" type="checkbox" id="flexSwitchCheckDefault" onClick={changeColorMode}
                className={`form-check form-switch theme-switch btn btn-light btn-icon rounded-circle ${className}`}>
                <Form.Check.Input type="checkbox" value={storageValue} style={{ display: 'none' }} />
                <Form.Check.Label style={{ cursor: 'pointer' }}>
                    <Image src={imageSrc} alt="" />
                </Form.Check.Label>
            </Link>
        </Fragment>
    )
}

export default DarkLightMode