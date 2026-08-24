import { createAirServer } from "@air/server"

const server = await createAirServer()
console.log(`aird listening on ${server.url}`)
