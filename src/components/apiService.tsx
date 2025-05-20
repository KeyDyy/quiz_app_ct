// apiService.js
let storedData: any = null;

export const setStoredData = (data: null) => {
  storedData = data;
  return null;
};

export const getStoredData = () => {
  return storedData;
};