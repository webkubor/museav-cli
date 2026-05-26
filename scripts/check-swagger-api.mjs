const SWAGGER_URL = 'https://modelgo-web-api.test.modelgo.com/swagger/doc.json'

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete'])

const response = await fetch(SWAGGER_URL)
if (!response.ok) {
  throw new Error(`Failed to fetch Swagger API doc: ${response.status} ${response.statusText}`)
}

const document = await response.json()
const paths = document.paths ?? {}
const endpoints = Object.entries(paths).flatMap(([path, item]) =>
  Object.keys(item)
    .filter((method) => METHODS.has(method))
    .map((method) => `${method.toUpperCase()} ${path}`)
)

if (endpoints.length === 0) {
  throw new Error('Swagger API doc contains no endpoints')
}

console.log(`Swagger API doc: ${SWAGGER_URL}`)
console.log(`API title: ${document.info?.title ?? '(unknown)'}`)
console.log(`API version: ${document.info?.version ?? '(unknown)'}`)
console.log(`API endpoints: ${endpoints.length}`)
