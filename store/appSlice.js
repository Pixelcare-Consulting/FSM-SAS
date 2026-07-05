// import node module libraries
import { createSlice } from '@reduxjs/toolkit'

// import app config file
import { settings } from 'app.config';

const initialState = {
  version: settings.app.version,
  skin: settings.theme.skin
}
export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    changeSkin: (state, action) => {
      document.querySelector('html').setAttribute('data-theme', action.payload); 
      state.skin = action.payload;
    }
  },
})

export const { changeSkin } = appSlice.actions

export default appSlice.reducer