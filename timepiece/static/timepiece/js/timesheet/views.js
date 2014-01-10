var EntryRow = Backbone.View.extend({
    tagName: "tr",
    initialize: function() {
        this.listenTo(this.model, "change", this.render);
    },
    events: {
        "click a[title='Approve']": "approveEntry",
        "click a[title='Delete']": "deleteEntry",
        "click a[title='Edit']": "editEntry",
        "click a[title='Reject']": "rejectEntry",
        "click a[title='Verify']": "verifyEntry"
    },
    getTagId: function() {
        return "entry-" + this.model.get("id");
    },
    render: function() {
        this.$el.attr({id: this.getTagId()});
        if (!this.model.isFromCurrentMonth()) {
            this.$el.addClass('muted')
                    .attr({
                'data-toggle': 'tooltip',
                'title': 'You cannot edit an entry from another month.'
            });
        }
        template = _.template($('#entry-row-template').html(), { model: this.model });
        this.$el.html(template);
        return this;
    },

    approveEntry: function(event) {
        event.preventDefault();
        if (this.model.isFromCurrentMonth()) {
            var msg = this.model.description() + " is now approved.";
            approveEntries(this.model.collection, [this.model.get("id")], msg);
        } else {
            showError("You can't edit an entry from another month.");
        }
    },
    deleteEntry: function() {
        event.preventDefault();
        timesheet.modal.setTitle("Confirm Deletion");
        template = _.template($("#delete-template").html(), { entry: this.model });
        timesheet.modal.setContent(template);
        timesheet.modal.$el.find("#confirm-delete").on("click", function(event) {
            event.preventDefault();
            this.model.destroy({
                success: function(deletedModel, response) {
                    for (var i=0; i < deletedModel.weekTable.models.length; i++) {
                        var model = deletedModel.weekTable.models[i];
                        if (model.get('id') == deletedModel.get('id')) {
                            deletedModel.weekTable.models.splice(i, 1);
                            deletedModel.row.$el.remove();
                            deletedModel.weekTable.updateTotalHours();
                            timesheet.modal.hide();
                            break;
                        }
                    }
                    showSuccess(deletedModel.description() + " has been deleted.");
                }
            });
        }.bind(this));
        timesheet.modal.show();
    },
    editEntry: function(event) {
        event.preventDefault();
        var self = this;
        $.ajax({
            url: this.model.get('get_edit_url'),
            dataType: 'html'
        }).done(function(data, status, xhr) {
            timesheet.modal.setTitle("Update Entry");
            timesheet.modal.setContent(data);
            initializeDatepickers();  // For start and end dates.
            var onSubmit = function(event) {
                // It would be too hard to parse the form, set elements on
                // the model, and then call Backbone's save. Instead, we'll
                // submit the form for server-side validation. If the form
                // is valid, we update the model using the returned data.
                // If the form is invalid, we update the form & reattach the
                // this function.
                event.preventDefault();
                $.ajax({
                    type: "POST",
                    url: self.model.get("get_edit_url"),
                    data: $(this).serialize(),
                    success: function(data, status, xhr) {
                        self.model.set(data);
                        self.model.weekTable.updateTotalHours();
                        timesheet.modal.hide();
                        showSuccess(self.model.description() + " has been updated.");
                    },
                    error: function(xhr, status, error) {
                        if (xhr.status === 400) {
                            timesheet.modal.setContent(xhr.responseText);
                            initializeDatepickers();  // For start and end dates.
                            timesheet.modal.$el.find('form').on('submit', onSubmit);
                            return;
                        }
                        return handleAjaxFailure(xhr, status, error);
                    }
                })
            };
            timesheet.modal.$el.find('form').on('submit', onSubmit);
            timesheet.modal.show();
        }).fail(handleAjaxFailure);
    },
    rejectEntry: function(event) {
        event.preventDefault();
        if (this.model.isFromCurrentMonth()) {
            var msg = this.model.description() + " is now unverified.";
            rejectEntries(this.model.collection, [this.model.get("id")], msg);
        } else {
            showError("You can't edit an entry from another month.");
        }
    },
    verifyEntry: function(event) {
        event.preventDefault();
        if (this.model.isFromCurrentMonth()) {
            var msg = this.model.description() + " is now verified.";
            verifyEntries(this.model.collection, [this.model.get("id")], msg);
        } else {
            showError("You can't edit an entry from another month.");
        }
    }
});

var WeekTable = Backbone.View.extend({
    tagName: "div",
    initialize: function() {
        this.models = this.options['models'];
        this.weekStart = this.options['weekStart'];
        this.weekEnd = this.options['weekEnd'];
        this.thisMonth = this.options['thisMonth'];
        this.lastMonth = this.options['lastMonth'];
        this.nextMonth = this.options['nextMonth'];
        this.timesheet = this.options['timesheet'];
    },
    events: {
        "click .btn[title='Approve Week']": "approveWeek",
        "click .btn[title='Reject Week']": "rejectWeek",
        "click .btn[title='Verify Week']": "verifyWeek"
    },
    updateTotalHours: function() {
        this.totalHours = 0;
        _.each(this.models, function(entry) {
            this.totalHours += entry.get("total_seconds");
        }, this);
        this.$el.find(".week-summary .total-hours").text(formatHoursMinutes(this.totalHours));
        if (this.models.length > 0) {
            this.$el.find(".hide-if-empty").attr({style: ""});
            this.$el.find(".show-if-empty").attr({style: "display:none;"});
        } else {
            this.$el.find(".hide-if-empty").attr({style: "display:none;"});
            this.$el.find(".show-if-empty").attr({style: ""});
        }
    },
    render: function() {
        this.$el.addClass('week');
        this.$el.append($(_.template($('#week-template').html(), {
            weekStart: this.weekStart,
            weekEnd: this.weekEnd
        })));
        _.each(this.models, function(entry) {
            var row = new EntryRow({ model: entry });
            entry.row = row;
            row.render().$el.insertBefore(this.$el.find('tbody tr.week-summary'));
        }, this);
        this.updateTotalHours();
        return this;
    },

    approveWeek: function(event) {
        event.preventDefault();
        var msg = "All verified entries from the week of " +
                displayDate(this.weekStart) + " are now approved.",
            entryIds = getIdsFromCurrentMonth(this.models);
        approveEntries(this.collection, entryIds, msg);
    },
    rejectWeek: function(event) {
        event.preventDefault();
        var msg = "All entries from the week of " +
                displayDate(this.weekStart) + " are now unverified.",
            entryIds = getIdsFromCurrentMonth(this.models);
        rejectEntries(this.collection, entryIds, msg);
    },
    verifyWeek: function(event) {
        event.preventDefault();
        var msg = "All entries from the week of " +
                displayDate(this.weekStart) + " are now verified.",
            entryIds = getIdsFromCurrentMonth(this.models);
        verifyEntries(this.collection, entryIds, msg);
    }
});

var Timesheet = Backbone.View.extend({
    el: "body",
    addEntryToTimesheet: function(newEntry) {
        // Adds entry to the correct week table & place within the table.
        var newEndTime = newEntry.getEndTime();

        // Find the week which contains the newEndTime.
        var weekTable = _.find(this.weekTables, function(weekTable) {
            return newEndTime >= weekTable.weekStart && newEndTime <= weekTable.weekEnd;
        });
        newEntry.weekTable = weekTable;

        // If no week is found, entry is from either before or after this
        // month.
        if (!weekTable) { return false; }

        // Otherwise, find the first entry in the week whose end time is
        // larger than the newEndTime - the new entry should be inserted
        // before this entry.
        found = _.find(weekTable.models, function(old_entry, index, models) {
            if (old_entry.getEndTime() > newEndTime) {
                // Add newEntry to the weekTable, and render it.
                var newEntry = this;
                models.splice(index, 0, newEntry);
                var row = new EntryRow({ model: newEntry });
                newEntry.row = row;
                row.render().$el.insertBefore(row.model.weekTable.$el.find("tbody tr#" + old_entry.row.getTagId()));
                return true;
            }
            return false;
        }, newEntry); // bind to newEntry

        // If no such entry was found, then the entry should be inserted at
        // the end of the table.
        if (!found) {
            weekTable.models.push(newEntry);
            var row = new EntryRow({model: newEntry});
            newEntry.row = row;
            row.render().$el.insertBefore(row.model.weekTable.$el.find("tbody tr.week-summary"));
        }

        return true;
    },
    initialize: function() {
        // Create a table view for each week of the month.
        this.thisMonth = this.options['thisMonth']
        this.nextMonth = this.options['nextMonth']
        this.lastMonth = this.options['lastMonth']
        this.weekTables = [];
        _.each(this.options['weekRanges'], function(range) {
            this.weekTables.push(new WeekTable({
                collection: this.collection,  // Pass for reference.
                models: [],  // The entries which are a part of the week.
                thisMonth: this.thisMonth,
                nextMonth: this.nextMonth,
                lastMonth: this.lastMonth,
                weekStart: new Date(range[0]),
                weekEnd: new Date(range[1]),
                timesheet: this
            }));
        }, this);

        // Split entries by week.
        // (Assumes that entries are in ascending order by end_time.)
        var weekCursor = entryCursor = 0;
        for (entryCursor; entryCursor < this.collection.length;) {
            if (weekCursor >= this.weekTables.length) { break; }

            var weekTable = this.weekTables[weekCursor],
                entry = this.collection.at(entryCursor);
                date = entry.getEndTime();

            if (date > weekTable.weekEnd) { weekCursor++; }
            else if (date < weekTable.weekStart) { entryCursor++; }
            else {
                entry.weekTable = weekTable;  // Store table on entry.
                weekTable.models.push(entry);
                entryCursor++;
            }
        }

        // Render the table for each week.
        _.each(this.weekTables, function(weekTable) {
            $('#all-entries').append(weekTable.render().el);
        }, this)

        this.modal = new Modal();
        this.$el.append(this.modal.render());
    },
    events: {
        "click .btn[title='Verify All']": "verifyMonth",
        "click .btn[title='Approve All']": "approveMonth",
        "click .btn[title='Reject All']": "rejectMonth",
        "click a[title='Add Entry']": "createEntry",
        "click .btn.last-month": "",
        "click .btn.next-month": "",
        "click .btn.refresh": "",
        //"change #filter-entries select": "filterEntries"
    },
    render: function() {
        return this;
    },
    /*
    filterEntries: function(event) {
        entryStatus = event.currentTarget.value;
        var coll;
        if (entryStatus !== "") {
            this.filter = {'status': entryStatus};
            coll = this.collection.where(this.filter);
        } else {
            coll = this.collection.toArray();
        }
        this.table.empty();
        _.each(coll, function(entry) {
            var view = new EntryRow({ model: entry });
            this.table.append(view.render().el);
        }, this)
    },
    */
    approveMonth: function(event) {
        event.preventDefault();
        var msg = "All verified entries from the month of " +
                fullMonths[this.thisMonth.getMonth()] + " are now approved.",
            entryIds = getIdsFromCurrentMonth(this.collection.toArray());
        approveEntries(this.collection, entryIds, msg);
    },
    createEntry: function(event) {
        event.preventDefault();
        $.ajax({
            url: createEntryUrl,
            dataType: 'html'
        }).done(function(data, status, xhr) {
            timesheet.modal.setTitle("Add Entry");
            timesheet.modal.setContent(data);
            initializeDatepickers();  // For start and end dates.
            var onSubmit = function(event) {
                event.preventDefault();
                $.ajax({
                    type: "POST",
                    url: createEntryUrl,
                    data: $(this).serialize(),
                    success: function(data, status, xhr) {
                        var entry = new Entry(data);
                        var added = timesheet.addEntryToTimesheet(entry);
                        if (entry.weekTable) { entry.weekTable.updateTotalHours(); }
                        timesheet.modal.hide();
                        if (added) {
                            showSuccess(entry.description() + " has been created.");
                        } else {
                            showSuccess(entry.description() + " has been added to " +
                                    fullMonths[entry.getEndTime().getMonth()] + ".");
                        }
                    },
                    error: function(xhr, status, error) {
                        if (xhr.status === 400) {
                            timesheet.modal.setContent(xhr.responseText);
                            initializeDatepickers();  // For start and end dates.
                            timesheet.modal.$el.find('form').on('submit', onSubmit);
                            return;
                        }
                        return handleAjaxFailure(xhr, status, error);
                    }
                });
            };
            timesheet.modal.$el.find('form').on('submit', onSubmit);
            timesheet.modal.show();
        }).fail(handleAjaxFailure);
    },
    rejectMonth: function(event) {
        event.preventDefault();
        var msg = "All entries from the month of " +
                fullMonths[this.thisMonth.getMonth()] + " are now unverified.",
            entryIds = getIdsFromCurrentMonth(this.collection.toArray());
        rejectEntries(this.collection, entryIds, msg);
    },
    verifyMonth: function(event) {
        event.preventDefault();
        var msg = "All entries from the month of " +
                fullMonths[this.thisMonth.getMonth()] + " are now verified.",
            entryIds = getIdsFromCurrentMonth(this.collection.toArray());
        verifyEntries(this.collection, entryIds, msg);
    }
});

var Modal = Backbone.View.extend({
    tagName: "div",
    initialize: function() {
        this.$el.addClass("modal hide fade");
        this.template = _.template($("#modal-template").html());
        this.modalTitle = "";
        this.modalContent = "";
        this.render();
    },
    setContent: function(content) {
        this.modalContent = content;
        this.render();
    },
    setTitle: function(title) {
        this.modalTitle = title;
        this.render();
    },
    hide: function() {
        this.$el.modal('hide');
    },
    show: function() {
        this.$el.modal('show');
    },
    render: function() {
        this.$el.html(this.template({
            "modalTitle": this.modalTitle,
            "modalContent": this.modalContent
        }));
        return this.$el;
    }
})
