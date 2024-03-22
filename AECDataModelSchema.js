const MAX_RESULTS = 32;

async function exec(query, variables) {
    const response = await fetch("https://developer.api.autodesk.com/aecdatamodel/graphql", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + window.ACCESS_TOKEN,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ query, variables })
    });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    const { errors, data } = await response.json();
    if (errors) {
        throw new Error(errors.map(err => JSON.stringify(err)).join('\n'));
    }
    return data;
}

async function collate(query, variables, getPage, mapResult) {
    let response = await exec(query, variables);
    let page = getPage(response);
    let results = page.results.map(mapResult);
    while (page.pagination?.cursor) {
        variables.pagination = page.pagination;
        response = await exec(query, variables);
        page = getPage(response);
        results = results.concat(page.results.map(mapResult));
        if (results.length > MAX_RESULTS) {
            console.warn(`Too many results. Capping to ${MAX_RESULTS}.`);
            return results.slice(0, MAX_RESULTS);
        }
    }
    return results;
}

export class User {
    static schema = {
        props: {
            id: {
                type: "string",
                required: true
            },
            firstName: {
                type: "string",
                required: false
            },
            lastName: {
                type: "string",
                required: false
            },
            userName: {
                type: "string",
                required: false
            },
            email: {
                type: "string",
                required: false
            },
            createdOn: {
                type: "datetime",
                required: false
            },
            lastModifiedOn: {
                type: "datetime",
                required: false
            }
        },
        links: {}
    };

    constructor({ id, firstName, lastName, userName, email, createdOn, lastModifiedOn }) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.userName = userName;
        this.email = email;
        this.createdOn = createdOn;
        this.lastModifiedOn = lastModifiedOn;
    }

    get name() { return this.userName; }
}

export class Element {
    static schema = {
        props: {
            id: {
                type: "string",
                required: true
            },
            name: {
                type: "string",
                required: false
            }
        },
        links: {}
    };

    constructor({ id, name }) {
        this.id = id;
        this.name = name;
    }
}

export class Lineage {
    static schema = {
        props: {
            id: {
                type: "string",
                required: true
            }
        },
        links: {
            tipVersion: {
                params: {},
                output: {
                    type: "object",
                    // schema: Version.schema,
                    required: false
                }
            },
            versions: {
                params: {
                    filter: {
                        type: "...",
                        required: false
                    }
                },
                output: {
                    type: "list",
                    // schema: Version.schema,
                    required: true
                }
            }
        }
    };

    constructor(designId, { id }) {
        this.designId = designId;
        this._id = id;
    }

    get id() { return `lineage/${this._id}`; }

    get name() { return "Lineage"; }

    async tipVersion() {
        const query = `
            query GetLineageTipVersion {
                aecDesignAtTip(designId: "${this.designId}") {
                    lineage {
                        tipVersion {  ${Object.keys(Version.schema.props).join(", ")} }
                    }
                }
            }
        `;
        const response = await exec(query);
        return new Version(this.designId, response.aecDesignAtTip.lineage.tipVersion);
    }

    async versions({ filter }) {
        const query = `
            query GetLineageVersions($filter: VersionFilterInput, $pagination: PaginationInput) {
                aecDesignAtTip(designId: "${this.designId}") {
                    lineage {
                        versions(filter: $filter, pagination: $pagination) {
                            pagination { cursor }
                            results { ${Object.keys(Version.schema.props).join(", ")} }
                        }
                    }
                }
            }
        `;
        return collate(query, { filter }, response => response.aecDesignAtTip.lineage.versions, result => new Version(this.designId, result));
    }
}

export class Version {
    static schema = {
        props: {
            versionNumber: {
                type: "number",
                required: true
            },
            createdOn: {
                type: "datetime",
                required: false
            }
        },
        links: {
            createdBy: {
                params: {},
                output: {
                    type: "object",
                    // schema: User.schema,
                    required: false
                }
            }
        }
    };

    constructor(designId, { versionNumber, createdOn }) {
        this.designId = designId;
        this.versionNumber = versionNumber;
        this.createdOn = createdOn;
    }

    get id() { return `${this.designId}#${this.versionNumber}`; }

    get name() { return this.versionNumber; }
    
    async createdBy() {
        const query = `
            query GetVersionCreatedBy {
                aecDesignByVersionNumber(designId: "${this.designId}", versionNumber: ${this.versionNumber}) {
                    createdBy { ${Object.keys(User.schema.props).join(", ")} }
                }
            }
        `;
        const response = await exec(query);
        return new User(response.aecDesignByVersionNumber.createdBy);
    }
}

export class PropertyDefinition {
    static schema = {
        props: {
            id: {
                type: "string",
                required: true
            },
            name: {
                type: "string",
                required: true
            },
            description: {
                type: "string",
                required: false
            },
            readOnly: {
                type: "boolean",
                required: true
            },
            specification: {
                type: "string",
                required: false
            },
            units: {
                type: "string",
                required: false
            }
        },
        links: {}
    };

    constructor({ id, name, description, readOnly, specification, units }) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.readOnly = readOnly;
        this.specification = specification;
        this.units = units;
    }
}

export class AECDesign {
    static schema = {
        props: {
            id: {
                type: "string",
                required: true
            },
            name: {
                type: "string",
                required: false
            },
            createdOn: {
                type: "datetime",
                required: false
            },
            lastModifiedOn: {
                type: "datetime",
                required: false
            }
        },
        links: {
            elements: {
                params: {
                    filter: {
                        type: "...",
                        required: false
                    }
                },
                output: {
                    type: "list",
                    // schema: Element.schema,
                    required: true
                }
            },
            propertyDefinitions: {
                params: {
                    filter: {
                        type: "...",
                        required: false
                    }
                },
                output: {
                    type: "object",
                    // schema: PropertyDefinition.schema,
                    required: true
                }
            },
            version: {
                params: {},
                output: {
                    type: "object",
                    // schema: Version.schema,
                    required: false
                }
            },
            lineage: {
                params: {},
                output: {
                    type: "object",
                    // schema: Lineage.schema,
                    required: true
                }
            },
            createdBy: {
                params: {},
                output: {
                    type: "object",
                    // schema: User.schema,
                    required: false
                }
            },
            lastModifiedBy: {
                params: {},
                output: {
                    type: "object",
                    // schema: User.schema,
                    required: false
                }
            }
        }
    };

    constructor({ id, name, createdOn, lastModifiedOn }) {
        this.id = id;
        this.name = name;
        this.createdOn = createdOn;
        this.lastModifiedOn = lastModifiedOn;
    }

    async elements({ filter }) {
        const query = `
            query GetAECDesignElements($filter: ElementFilterInput, $pagination: PaginationInput) {
                aecDesignAtTip(designId: "${this.id}") {
                    elements(filter: $filter, pagination: $pagination) {
                        pagination { cursor }
                        results { ${Object.keys(Element.schema.props).join(", ")} }
                    }
                }
            }
        `;
        return collate(query, { filter }, response => response.aecDesignAtTip.elements, result => new Element(result));
    }

    async propertyDefinitions({ filter }) {
        const query = `
            query GetAECDesignPropertyDefinitions($filter: PropertyDefinitionFilterInput, $pagination: PaginationInput) {
                aecDesignAtTip(designId: "${this.id}") {
                    propertyDefinitions(filter: $filter, pagination: $pagination) {
                        pagination { cursor }
                        results { ${Object.keys(PropertyDefinition.schema.props).join(", ")} }
                    }
                }
            }
        `;
        return collate(query, { filter }, response => response.aecDesignAtTip.propertyDefinitions, result => new PropertyDefinition(result));
    }

    async version() {
        const query = `
            query GetAECDesignVersion {
                aecDesignAtTip(designId: "${this.id}") {
                    version { ${Object.keys(Version.schema.props).join(", ")} }
                }
            }
        `;
        const response = await exec(query);
        return new Version(this.id, response.aecDesignAtTip.version);
    }

    async lineage() {
        const query = `
            query GetAECDesignLineage {
                aecDesignAtTip(designId: "${this.id}") {
                    lineage { ${Object.keys(Lineage.schema.props).join(", ")} }
                }
            }
        `;
        const response = await exec(query);
        return new Lineage(this.id, response.aecDesignAtTip.lineage);
    }

    async createdBy() {
        const query = `
            query GetAECDesignCreatedBy {
                aecDesignAtTip(designId: "${this.id}") {
                    createdBy { ${Object.keys(User.schema.props).join(", ")} }
                }
            }
        `;
        const response = await exec(query);
        return new User(response.aecDesignAtTip.createdBy);
    }

    async lastModifiedBy() {
        const query = `
            query GetAECDesignCreatedBy {
                aecDesignAtTip(designId: "${this.id}") {
                    lastModifiedBy { ${Object.keys(User.schema.props).join(", ")} }
                }
            }
        `;
        const response = await exec(query);
        return new User(response.aecDesignAtTip.lastModifiedBy);
    }
}

export class Folder {
    static schema = {
        props: {
            id: {
                type: "string",
                required: true
            },
            name: {
                type: "string",
                required: false
            },
            createdOn: {
                type: "datetime",
                required: false
            },
            lastModifiedOn: {
                type: "datetime",
                required: false
            },
            objectCount: {
                type: "number",
                required: false
            },
            extensionType: {
                type: "string",
                required: false
            }
        },
        links: {
            hub: {
                params: {},
                output: {
                    type: "object",
                    // schema: Hub.schema,
                    required: false
                }
            },
            project: {
                params: {},
                output: {
                    type: "object",
                    // schema: Project.schema,
                    required: false
                }
            },
            parentFolder: {
                params: {},
                output: {
                    type: "object",
                    // schema: Folder.schema,
                    required: false
                }
            },
            createdBy: {
                params: {},
                output: {
                    type: "object",
                    // schema: User.schema,
                    required: false
                }
            },
            lastModifiedBy: {
                params: {},
                output: {
                    type: "object",
                    // schema: User.schema,
                    required: false
                }
            },
            folders: {
                params: {
                    filter: {
                        type: "...",
                        required: false
                    }
                },
                output: {
                    type: "list",
                    // schema: Folder.schema,
                    required: true
                }
            },
            aecDesigns: {
                params: {
                    filter: {
                        type: "...",
                        required: false
                    }
                },
                output: {
                    type: "list",
                    // schema: AECDesign.schema,
                    required: true
                }
            }
        }
    };

    constructor({ id, name, createdOn, lastModifiedOn, objectCount, extensionType }) {
        this.id = id;
        this.name = name;
        this.createdOn = createdOn;
        this.lastModifiedOn = lastModifiedOn;
        this.objectCount = objectCount;
        this.extensionType = extensionType;
    }

    async hub() {
        const query = `
            query GetFolderHub {
                folder(folderId: "${this.id}") {
                    hub { ${Object.keys(Hub.schema.props).join(", ")} }
                }
            }
        `;
        const response = await exec(query);
        return new Hub(response.folder.hub);
    }

    async project() {
        const query = `
            query GetFolderProject {
                folder(folderId: "${this.id}") {
                    project { ${Object.keys(Project.schema.props).join(", ")} }
                }
            }
        `;
        const response = await exec(query);
        return new Project(response.folder.project);
    }

    async folders({ filter }) {
        const query = `
            query GetFolderFolders($filter: FolderFilterInput, $pagination: PaginationInput) {
                folder(folderId: "${this.id}") {
                    folders(filter: $filter, pagination: $pagination) {
                        pagination { cursor }
                        results { ${Object.keys(Folder.schema.props).join(", ")} }
                    }
                }
            }
        `;
        return collate(query, { filter }, response => response.folder.folders, result => new Folder(result));
    }

    async aecDesigns({ filter }) {
        const query = `
            query GetFolderDesigns($filter: AECDesignFilterInput, $pagination: PaginationInput) {
                folder(folderId: "${this.id}") {
                    aecDesigns(filter: $filter, pagination: $pagination) {
                        pagination { cursor }
                        results { ${Object.keys(AECDesign.schema.props).join(", ")} }
                    }
                }
            }
        `;
        return collate(query, { filter }, response => response.folder.aecDesigns, result => new AECDesign(result));
    }

    async parentFolder() {
        const query = `
            query GetFolderParentFolder {
                folder(folderId: "${this.id}") {
                    parentFolder { ${Object.keys(Folder.schema.props).join(", ")} }
                }
            }
        `;
        const response = await exec(query);
        return new Folder(response.folder.parentFolder);
    }

    async createdBy() {
        const query = `
            query GetFolderCreatedBy {
                folder(folderId: "${this.id}") {
                    createdBy { ${Object.keys(User.schema.props).join(", ")} }
                }
            }
        `;
        const response = await exec(query);
        return new User(response.folder.createdBy);
    }

    async lastModifiedBy() {
        const query = `
            query GetFolderParentFolder {
                folder(folderId: "${this.id}") {
                    lastModifiedBy { ${Object.keys(User.schema.props).join(", ")} }
                }
            }
        `;
        const response = await exec(query);
        return new User(response.folder.lastModifiedBy);
    }
}

export class ProjectAlternativeRepresentations {
    static schema = {
        props: {
            externalProjectId: {
                type: "string",
                required: true
            }
        },
        links: {}
    };

    constructor({ externalProjectId }) {
        this.externalProjectId = externalProjectId;
    }

    get id() { return this.externalProjectId; }

    get name() { return this.externalProjectId; }
}

export class Project {
    static schema = {
        props: {
            id: {
                type: "string",
                required: true
            },
            name: {
                type: "string",
                required: false
            }
        },
        links: {
            hub: {
                params: {},
                output: {
                    type: "object",
                    // schema: Hub.schema,
                    required: false
                }
            },
            folders: {
                params: {},
                output: {
                    type: "list",
                    // schema: Folder.schema,
                    required: false
                }
            },
            aecDesigns: {
                params: {
                    filter: {
                        type: "...",
                        required: false
                    }
                },
                output: {
                    type: "list",
                    // schema: AECDesign.schema,
                    required: true
                }
            },
            alternativeRepresentations: {
                params: {},
                output: {
                    type: "object",
                    // schema: ProjectAlternativeRepresentations.schema,
                    required: false
                }
            }
        }
    };

    constructor({ id, name }) {
        this.id = id;
        this.name = name;
    }

    async hub() {
        const query = `
            query GetProjectHub {
                project(projectId: "${this.id}") {
                    hub { ${Object.keys(Hub.schema.props).join(", ")} }
                }
            }
        `;
        const response = await exec(query);
        return new Hub(response.project.hub);
    }

    async folders() {
        const query = `
            query GetProjectFolders {
                project(projectId: "${this.id}") {
                    folders {
                        pagination { cursor }
                        results { ${Object.keys(Folder.schema.props).join(", ")} }
                    }
                }
            }
        `;
        return collate(query, {}, response => response.project.folders, result => new Folder(result));
    }

    async aecDesigns({ filter }) {
        const query = `
            query GetProjectDesigns($filter: AECDesignFilterInput, $pagination: PaginationInput) {
                project(projectId: "${this.id}") {
                    aecDesigns(filter: $filter, pagination: $pagination) {
                        pagination { cursor }
                        results { ${Object.keys(AECDesign.schema.props).join(", ")} }
                    }
                }
            }
        `;
        return collate(query, { filter }, response => response.project.aecDesigns, result => new AECDesign(result));
    }

    async alternativeRepresentations() {
        const query = `
            query GetProjectAlternativeRepresentations {
                project(projectId: "${this.id}") {
                    alternativeRepresentations {
                        externalProjectId
                    }
                }
            }
        `;
        const response = await exec(query);
        return new ProjectAlternativeRepresentations(response.project.alternativeRepresentations);
    }
}

export class Hub {
    static schema = {
        props: {
            id: {
                type: "string",
                required: true
            },
            name: {
                type: "string",
                required: false
            }
        },
        links: {
            projects: {
                params: {
                    filter: {
                        type: "...",
                        required: false
                    }
                },
                output: {
                    type: "list",
                    // schema: Project.schema,
                    required: true
                }
            }
        }
    };

    constructor({ id, name }) {
        this.id = id;
        this.name = name;
    }

    async projects({ filter }) {
        const query = `
            query GetHubProjects($filter: ProjectFilterInput, $pagination: PaginationInput) {
                hub(hubId: "${this.id}") {
                    projects(filter: $filter, pagination: $pagination) {
                        pagination { cursor }
                        results { ${Object.keys(Project.schema.props).join(", ")} }
                    }
                }
            }
        `;
        return collate(query, { filter }, response => response.hub.projects, result => new Project(result));
    }
}

export class Query {
    static schema = {
        props: {},
        links: {
            hubs: {
                params: {
                    filter: {
                        type: "...",
                        required: false
                    }
                },
                output: {
                    type: "list",
                    // schema: Hub.schema,
                    required: true
                }
            }
        }
    };

    get id() {
        return "query";
    }

    get name() {
        return "Query";
    }

    async hubs({ filter }) {
        const query = `
            query GetHubs($filter: HubFilterInput, $pagination: PaginationInput) {
                hubs(filter: $filter, pagination: $pagination) {
                    pagination { cursor }
                    results { ${Object.keys(Hub.schema.props).join(", ")} }
                }
            }
        `;
        return collate(query, { filter }, response => response.hubs, result => new Hub(result));
    }
}