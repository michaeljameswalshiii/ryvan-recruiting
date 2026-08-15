declare module 'all-the-cities' {
  type CityRecord = {
    name: string;
    country: string;
    adminCode: string;
    population: number;
    loc: { type: 'Point'; coordinates: [number, number] };
  };
  const cities: CityRecord[];
  export default cities;
}

declare module 'zipcodes' {
  type ZipRecord = {
    zip: string;
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
  };
  const zipcodes: {
    lookup(zip: string | number): ZipRecord | undefined;
    lookupByName(city: string, state: string): ZipRecord[];
    radius(zip: string | number, miles: number): string[];
  };
  export default zipcodes;
}
