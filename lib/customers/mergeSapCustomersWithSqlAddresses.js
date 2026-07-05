/**
 * Same merge as `loadData` in `pages/dashboard/customers/list.js`:
 * getAllCustomers + getAllAddresses (SQL Query 14) → one row per CardCode with AllAddresses[].
 */
export function mergeCustomersWithAddressesLikeList(allCustomers, addresses) {
  const customerMap = new Map();
  (allCustomers || []).forEach((customer) => {
    customerMap.set(customer.CardCode, {
      CardCode: customer.CardCode,
      CardName: customer.CardName,
      Phone1: customer.Phone1 || '',
      EmailAddress: customer.EmailAddress || '',
      AllAddresses: []
    });
  });

  (addresses || []).forEach((address) => {
    const customerCode = address.CustomerCode || address.CardCode;
    if (customerCode && customerMap.has(customerCode)) {
      const customer = customerMap.get(customerCode);
      customer.AllAddresses.push({
        Address1: address.Address1,
        Address2: address.Address2,
        Address3: address.Address3,
        Street: address.Street,
        Building: address.Building,
        BuildingFloorRoom: address.BuildingFloorRoom,
        PostalCode: address.PostalCode || address.ZipCode,
        ZipCode: address.ZipCode || address.PostalCode,
        Country: address.Country,
        CountryName: address.CountryName,
        AddressName: address.AddressName,
        SiteID: address.SiteID
      });
    }
  });

  return Array.from(customerMap.values()).sort((a, b) => {
    const codeA = (a.CardCode || '').toUpperCase();
    const codeB = (b.CardCode || '').toUpperCase();
    return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
  });
}
