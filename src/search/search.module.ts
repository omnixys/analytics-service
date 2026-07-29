import { Module } from "@nestjs/common";
import { SavedSearchService } from "./saved-search.service.js";
import { SearchResolver } from "./search.resolver.js";
import { SearchService } from "./search.service.js";

@Module({
  providers: [SearchService, SavedSearchService, SearchResolver],
  exports: [SearchService, SavedSearchService],
})
export class SearchModule {}
