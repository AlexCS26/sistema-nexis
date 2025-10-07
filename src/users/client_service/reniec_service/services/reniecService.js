const axios = require("axios");
const { reniecApiKey } = require("../../../config");

const consultarDni = async (dni) => {
  const response = await axios.get(
    `https://api.decolecta.com/v1/reniec/dni?numero=${dni}`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${reniecApiKey}`,
      },
    }
  );

  const data = response.data;
  return {
    nombres: data.first_name,
    apellidos: `${data.first_last_name} ${data.second_last_name}`,
    nombreCompleto: data.full_name,
    dni: data.document_number,
  };
};

module.exports = { consultarDni };
