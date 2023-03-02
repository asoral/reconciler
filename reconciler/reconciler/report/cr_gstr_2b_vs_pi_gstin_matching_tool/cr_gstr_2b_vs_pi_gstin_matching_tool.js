// Copyright (c) 2022, Aerele Technologies Private Limited and contributors
// For license information, please see license.txt
/* eslint-disable */

// Copyright (c) 2016, Aerele Technologies Private Limited and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["CR GSTR 2B vs PI GSTIN Matching Tool"] = {
	"filters": [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
			reqd: 1
		},
		{
			fieldname: "gst_state",
			label: __("GST State"),
			fieldtype: "Select",
			options: [
				'Andaman and Nicobar Islands',
				'Andhra Pradesh',
				'Arunachal Pradesh',
				'Assam',
				'Bihar',
				'Chandigarh',
				'Chhattisgarh',
				'Dadra and Nagar Haveli and Daman and Diu',
				'Delhi',
				'Goa',
				'Gujarat',
				'Haryana',
				'Himachal Pradesh',
				'Jammu and Kashmir',
				'Jharkhand',
				'Karnataka',
				'Kerala',
				'Ladakh',
				'Lakshadweep Islands',
				'Madhya Pradesh',
				'Maharashtra',
				'Manipur',
				'Meghalaya',
				'Mizoram',
				'Nagaland',
				'Odisha',
				'Other Territory',
				'Pondicherry',
				'Punjab',
				'Rajasthan',
				'Sikkim',
				'Tamil Nadu',
				'Telangana',
				'Tripura',
				'Uttar Pradesh',
				'Uttarakhand',
				'West Bengal'],
			reqd: 1,
			on_change: () => {
				frappe.call({
					method:"reconciler.reconciler.doctype.cd_gstr_2b_data_upload_tool.cd_gstr_2b_data_upload_tool.get_gstin_for_company",
					args:{company: frappe.query_report.get_filter_value('company'), gst_state: frappe.query_report.get_filter_value('gst_state')},
					callback: function(r){
						if (r.message){
							frappe.query_report.set_filter_value("company_gstin",r.message);
						}
						else {
							frappe.query_report.set_filter_value("company_gstin","");
						}
					}
				})
			},
		},	
		{
			fieldname: "company_gstin",
			label: __("Company GSTIN"),
			fieldtype: "Data",
			reqd: 1,
			read_only: 1
		},	
		{
			fieldname: 'based_on',
			label: __('Based On'),
			fieldtype: 'Select',
			options: ['Date', 'Return Period'],
			default: 'Date',
			reqd: 1,
			on_change: () => {
				var based_on = frappe.query_report.get_filter_value('based_on');
				if (based_on == 'Return Period'){
				frappe.call({
					method : 'reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.return_period_query',
					freeze : true,
					callback: function(r) {
						if(r.message) {
							let return_periods = r.message
							let options = []
							for(let option of return_periods){
								options.push({
									"value":option,
									"description":""
								})
							}
							var return_period = frappe.query_report.get_filter('return_period');
							return_period.df.options = options;
							return_period.refresh();
						}
					}
				});

				}
		}
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			depends_on:  "eval:doc.based_on == 'Date'"
		},
		{
			fieldname:"to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			depends_on:  "eval:doc.based_on == 'Date'"
		},
		{
			fieldname: "return_period",
			label: __("Return Period"),
			fieldtype: "Select",
			depends_on:  "eval:doc.based_on == 'Return Period'"
		},
		{
			fieldname: "transaction_type",
			label: __("Transaction Type"),
			fieldtype: "Select",
			options: ['','Invoice', 'CDN']
		},
		{
			fieldname: "view_type",
			label: __("View Type"),
			fieldtype: "Select",
			options: ['Supplier View', 'Document View'],
			default: 'Supplier View',
			reqd: 1
		},
		{
			fieldname: "supplier",
			label: __("Supplier"),
			fieldtype: "Link",
			options: 'Supplier',
			depends_on:  "eval:doc.view_type == 'Document View'"
		},
		{
			fieldname: "supplier_gstin",
			label: __("Supplier GSTIN"),
			fieldtype: "Data",
			depends_on:  "eval:doc.view_type == 'Document View'"
		},
		{
			fieldname: "match_status",
			label: __("Match Status"),
			fieldtype: "Select",
			options: ["","Exact Match", "Partial Match", "Probable Match", "Mismatch", "Missing in PI", "Missing in 2B"],
			depends_on:  "eval:doc.view_type == 'Document View'"
		},
		{
			fieldname: "document_status",
			label: __("Document Status"),
			fieldtype: "Select",
			options: ["","Pending", "Accepted"],
			depends_on:  "eval:doc.view_type == 'Document View'"
		}
	],
	get_datatable_options(options) {
		return Object.assign(options, {
			checkboxColumn: true
		});
	},
	onload: function(query_report) {
		query_report.page.add_action_item(__("⌛Pending"), () => {
			if(frappe.query_report.get_filter_value('view_type') == 'Supplier View'){
				frappe.throw(__('This action is allowed only for the document view type'));
				return;
			}
		var selected_rows = [];
		let indexes = query_report.datatable.rowmanager.getCheckedRows();
		for (let row = 0; row < indexes.length; ++row) {
			if(query_report.data[indexes[row]]['match_status']!='Missing in 2B'){
			selected_rows.push({'gstr_2b':query_report.data[indexes[row]]['gstr_2b']});
		}
		}
			if($.isEmptyObject(selected_rows))
			{
				frappe.throw(__("Please select rows to update status. Also, make sure that you have not selected any row of match status Missing in 2B."));
				return
			}
			else{
			frappe.call('reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.update_status', {
				data: selected_rows,
				status: 'Pending',
				freeze: true
			}).then(r => {
				frappe.msgprint(__("Status Updated"));
			});
		}
		})
		query_report.page.add_action_item(__("✔️ Accept"), () => {
			if(frappe.query_report.get_filter_value('view_type') == 'Supplier View'){
				frappe.throw(__('This action is allowed only for the document view type'));
				return;
			}
		var selected_rows = [];
		let indexes = query_report.datatable.rowmanager.getCheckedRows();
		for (let row = 0; row < indexes.length; ++row) {
			if(query_report.data[indexes[row]]['match_status']!='Missing in 2B'){
			selected_rows.push({'gstr_2b':query_report.data[indexes[row]]['gstr_2b']});
		}
		}
			if($.isEmptyObject(selected_rows))
			{
				frappe.throw(__("Please select rows to update status. Also, make sure that you have not selected any row of match status Missing in 2B."));
				return
			}
				else{
				frappe.call('reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.update_status', {
					data: selected_rows,
					status: 'Accepted',
					freeze: true
				}).then(r => {
					frappe.msgprint(__("Status Updated"));
				});
			}
		})


		query_report.page.add_action_item(__("Send Bulk Reminder"), () => {
			let company = frappe.query_report.get_filter('company');
			console.log('comapny**********',company.value)
			let supplier = frappe.query_report.get_filter('supplier');
			console.log('supplier^^^^^^^^^^^^^^^^^^^^',supplier)
			if(frappe.query_report.get_filter_value('view_type') == 'Supplier View'){
				frappe.throw(__('This action is allowed only for the document view type'));
				return;
			}
		let selected_rows = [];
		let indexes = query_report.datatable.rowmanager.getCheckedRows();
		for (let row = 0; row < indexes.length; ++row) {
			// if(query_report.data[indexes[row]]['match_status']='Missing in 2B'){
			selected_rows.push({'gstr_2b':query_report.data[indexes[row]]['gstr_2b']});
		// }
		}
			if($.isEmptyObject(selected_rows))
			{
				frappe.throw(__("Please select rows to update status. Also, make sure that you have not selected any row of match status Missing in 2B."));
				return
			}
				else{
					frappe.call(
						{
						method:'reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.send_notifications',
						// doc:frm.doc,
						
						args:{
							'company':company.value,
							'supplier':supplier.value,
							'data': selected_rows,
						},
						callback: function(r) {
							console.log('hhjjjj',r.message)
							if(r) {
								frappe.show_alert({message: __('Emails Queued'), indicator: 'blue'});

							}
							else{
								frappe.msgprint(__('No Records for these settings.'))
							}
						}
						
			});
			
			}
		})



		query_report.page.add_action_item(__("Send Email"), () => {
			let supplier = frappe.query_report.get_filter('supplier');
			let company = frappe.query_report.get_filter('company');
			let selected_rows = [];
				let indexes = query_report.datatable.rowmanager.getCheckedRows();
				for (let row = 0; row < indexes.length; ++row) {
					if(query_report.data[indexes[row]]['match_status']!='Missing in 2B'){
					selected_rows.push({'gstr_2b':query_report.data[indexes[row]]['gstr_2b']});
				}
				}
					if($.isEmptyObject(selected_rows))
					{
						frappe.throw(__("Please select rows to update status. Also, make sure that you have not selected any row of match status Missing in 2B."));
						return
					}
						else{
							
					
					}
			frappe.call(
				{
				method:'reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.set_content',
				// doc:frm.doc,
				 args : {
					'company':company.value,
					'supplier':supplier.value,
					'data': selected_rows,
				},
				callback: function(r) {
					console.log('hhjjjj',r.message)
					args = r.message
					new dg(args)
					console.log('args',args)
				}
			
	});
					

		},
			dg=frappe.views.NewEmail = class {
				constructor(opts) {
					const me = this;
					$.extend(opts);
					// if (!this.doc) {
					// 	this.doc = this.frm && this.frm.doc || {};
					// }
					console.log('he************************',opts)
					me.make(opts);
					me.set_content(opts[0]);
					console.log('opts0000000000000000000000000',opts[0])
					me.setup_subject_and_recipients(opts[1]);
					console.log('opts111111111111111111111111111',opts[1])
				}
			
				make(opts) {
					const me = this;
					console.log('opts',opts)
					this.dialog = new frappe.ui.Dialog({
						title: (this.title || this.subject || __("New Email")),
						no_submit_on_enter: true,
						fields: this.get_fields(),
						primary_action_label: __("Send"),
						primary_action() {
							me.send_action();
						},
						secondary_action_label: __("Discard"),
						secondary_action() {
							me.dialog.hide();
							me.clear_cache();
						},
						size: 'large',
						minimizable: true
					});
			
					$(this.dialog.$wrapper.find(".form-section").get(0)).addClass('to_section');
			
					this.prepare();
					this.dialog.show();
			
					if (this.frm) {
						$(document).trigger('form-typing', [this.frm]);
					}
				}
			
				get_fields() {
					const fields = [
						{
							label: __("To"),
							fieldtype: "MultiSelect",
							reqd: 0,
							fieldname: "recipients",
						},
						{
							fieldtype: "Button",
							label: frappe.utils.icon('down'),
							fieldname: 'option_toggle_button',
							click: () => {
								this.toggle_more_options();
							}
						},
						{
							fieldtype: "Section Break",
							hidden: 1,
							fieldname: "more_options"
						},
						{
							label: __("CC"),
							fieldtype: "MultiSelect",
							fieldname: "cc",
						},
						{
							label: __("BCC"),
							fieldtype: "MultiSelect",
							fieldname: "bcc",
						},
						// {
						// 	label: __("Email Template"),
						// 	fieldtype: "Data",
						// 	// options: "Email Template",
						// 	fieldname: "email_template"
						// },
						{ fieldtype: "Section Break" },
						{
							label: __("Subject"),
							fieldtype: "Data",
							reqd: 1,
							fieldname: "subject",
							length: 524288
						},
						{
							label: __("Message"),
							fieldtype: "Text Editor",
							fieldname: "content",
							onchange: frappe.utils.debounce(
								this.save_as_draft.bind(this),
								300
							)
						},
						{
							fieldtype: "Button",
							label: __("Add Signature"),
							fieldname: 'add_signature',
							hidden: 1,
							click: async function() {
								let sender_email = this.dialog.get_value('sender') || "";
								this.content_set = false;
								await this.set_content(sender_email);
							}
						},
						{ fieldtype: "Section Break" },
						{
							label: __("Send me a copy"),
							fieldtype: "Check",
							fieldname: "send_me_a_copy",
							default: frappe.boot.user.send_me_a_copy
						},
						{
							label: __("Send Read Receipt"),
							fieldtype: "Check",
							fieldname: "send_read_receipt"
						},
						{
							label: __("Attach Document Print"),
							fieldtype: "Check",
							fieldname: "attach_document_print"
						},
						{
							label: __("Select Print Format"),
							fieldtype: "Select",
							fieldname: "select_print_format"
						},
						{
							label: __("Select Languages"),
							fieldtype: "Select",
							fieldname: "language_sel"
						},
						{ fieldtype: "Column Break" },
						{
							label: __("Select Attachments"),
							fieldtype: "HTML",
							fieldname: "select_attachments"
						}
					];
			
					// add from if user has access to multiple email accounts
					const email_accounts = frappe.boot.email_accounts.filter(account => {
						return (
							!in_list(
								["All Accounts", "Sent", "Spam", "Trash"],
								account.email_account
							) && account.enable_outgoing
						);
					});
			
					if (email_accounts.length) {
						this.user_email_accounts = email_accounts.map(function(e) {
							return e.email_id;
						});
			
						fields.unshift({
							label: __("From"),
							fieldtype: "Select",
							reqd: 1,
							fieldname: "sender",
							options: this.user_email_accounts
						});
						//Preselect email senders if there is only one
						if (this.user_email_accounts.length==1) {
							this['sender'] = this.user_email_accounts
						}
					}
			
					return fields;
				}
			
				toggle_more_options(show_options) {
					show_options = show_options || this.dialog.fields_dict.more_options.df.hidden;
					this.dialog.set_df_property('more_options', 'hidden', !show_options);
			
					const label = frappe.utils.icon(show_options ? 'up-line': 'down');
					this.dialog.get_field('option_toggle_button').set_label(label);
				}
			
				prepare() {
					this.setup_multiselect_queries();
					this.setup_subject_and_recipients();
					// this.setup_print_language();
					this.setup_print();
					this.setup_attach();
					this.setup_email();
					// this.setup_email_template();
					this.setup_last_edited_communication();
					this.setup_add_signature_button();
					this.set_values();
				}
			
				setup_add_signature_button() {
					let has_sender = this.dialog.has_field('sender');
					this.dialog.set_df_property('add_signature', 'hidden', !has_sender);
				}
			
				setup_multiselect_queries() {
					['recipients', 'cc', 'bcc'].forEach(field => {
						this.dialog.fields_dict[field].get_data = () => {
							const data = this.dialog.fields_dict[field].get_value();
							const txt = data.match(/[^,\s*]*$/)[0] || '';
			
							frappe.call({
								method: "frappe.email.get_contact_list",
								args: {txt},
								callback: (r) => {
									this.dialog.fields_dict[field].set_data(r.message);
								}
							});
						};
					});
				}
			
				setup_subject_and_recipients(opts) {
					console.log('subject',opts)
					this.subject = opts;
			
					if (!this.forward && !this.recipients && this.last_email) {
						this.recipients = this.last_email.sender;
						this.cc = this.last_email.cc;
						this.bcc = this.last_email.bcc;
					}
			
					if (!this.forward && !this.recipients) {
						this.recipients = this.frm && this.frm.timeline.get_recipient();
					}
			
					if (!this.subject && this.frm) {
						// get subject from last communication
						const last = this.frm.timeline.get_last_email();
			
						if (last) {
							this.subject = last.subject;
							if (!this.recipients) {
								this.recipients = last.sender;
							}
			
							// prepend "Re:"
							if (strip(this.subject.toLowerCase().split(":")[0])!="re") {
								this.subject = __("Re: {0}", [this.subject]);
							}
						}
			
						if (!this.subject) {
							this.subject = this.frm.doc.name;
							if (this.frm.meta.subject_field && this.frm.doc[this.frm.meta.subject_field]) {
								this.subject = this.frm.doc[this.frm.meta.subject_field];
							} else if (this.frm.meta.title_field && this.frm.doc[this.frm.meta.title_field]) {
								this.subject = this.frm.doc[this.frm.meta.title_field];
							}
						}
			
						// always add an identifier to catch a reply
						// some email clients (outlook) may not send the message id to identify
						// the thread. So as a backup we use the name of the document as identifier
						const identifier = `#${this.frm.doc.name}`;
			
						// converting to str for int names
						if (!cstr(this.subject).includes(identifier)) {
							this.subject = `${this.subject} (${identifier})`;
						}
					}
			
					if (this.frm && !this.recipients) {
						this.recipients = this.frm.doc[this.frm.email_field];
					}
				}
			
				setup_email_template() {
					const me = this;
			
					this.dialog.fields_dict["email_template"].df.onchange = () => {
						// const email_template = me.dialog.fields_dict.email_template.get_value();
						const email_template = 'GSTR2b';
						// if (!email_template) return;
			
						function prepend_reply(reply) {
							// if (me.reply_added === email_template) return;
			
							const content_field = me.dialog.fields_dict.content;
							const subject_field = me.dialog.fields_dict.subject;
			
							let content = content_field.get_value() || "";
			
							content_field.set_value(`${reply.message}<br>${content}`);
							subject_field.set_value(reply.subject);
			
							// me.reply_added = email_template;
						}
			
						// frappe.call({
						// 	method: 'frappe.email.doctype.email_template.email_template.get_email_template',
						// 	args: {
						// 		template_name: email_template,
						// 		doc: me.doc,
						// 		_lang: me.dialog.get_value("language_sel")
						// 	},
						// 	callback(r) {
						// 		prepend_reply(r.message);
						// 	},
						// });
					};
				}
			
				setup_last_edited_communication() {
					if (this.frm) {
						this.doctype = this.frm.doctype;
						this.key = this.frm.docname;
					} else {
						this.doctype = this.key = "Inbox";
					}
			
					if (this.last_email) {
						this.key = this.key + ":" + this.last_email.name;
					}
			
					if (this.subject) {
						this.key = this.key + ":" + this.subject;
					}
			
					this.dialog.on_hide = () => {
						$.extend(
							this.get_last_edited_communication(true),
							this.dialog.get_values(true)
						);
			
						if (this.frm) {
							$(document).trigger("form-stopped-typing", [this.frm]);
						}
					};
				}
			
				get_last_edited_communication(clear) {
					if (!frappe.last_edited_communication[this.doctype]) {
						frappe.last_edited_communication[this.doctype] = {};
					}
			
					if (clear || !frappe.last_edited_communication[this.doctype][this.key]) {
						frappe.last_edited_communication[this.doctype][this.key] = {};
					}
			
					return frappe.last_edited_communication[this.doctype][this.key];
				}
			
				async set_values() {
					for (const fieldname of ["recipients", "cc", "bcc", "sender"]) {
						await this.dialog.set_value(fieldname, this[fieldname] || "");
					}
			
					const subject = frappe.utils.html2text(this.subject) || '';
					await this.dialog.set_value("subject", subject);
			
					await this.set_values_from_last_edited_communication();
					await this.set_content(opts);
			
					// set default email template for the first email in a document
					if (this.frm && !this.is_a_reply && !this.content_set) {
						const email_template = this.frm.meta.default_email_template || '';
						await this.dialog.set_value("email_template", email_template);
					}
			
					for (const fieldname of ['email_template', 'cc', 'bcc']) {
						if (this.dialog.get_value(fieldname)) {
							this.toggle_more_options(true);
							break;
						}
					}
				}
			
				async set_values_from_last_edited_communication() {
					if (this.message) return;
			
					const last_edited = this.get_last_edited_communication();
					if (!last_edited.content) return;
			
					// prevent re-triggering of email template
					if (last_edited.email_template) {
						const template_field = this.dialog.fields_dict.email_template;
						await template_field.set_model_value(last_edited.email_template);
						delete last_edited.email_template;
					}
			
					await this.dialog.set_values(last_edited);
					this.content_set = true;
				}
			
				selected_format() {
					return (
						this.dialog.fields_dict.select_print_format.input.value
						|| this.frm && this.frm.meta.default_print_format
						|| "Standard"
					);
				}
			
				get_print_format(format) {
					if (!format) {
						format = this.selected_format();
					}
			
					if (locals["Print Format"] && locals["Print Format"][format]) {
						return locals["Print Format"][format];
					} else {
						return {};
					}
				}
			
				setup_print_language() {
					const fields = this.dialog.fields_dict;
			
					//Load default print language from doctype
					this.lang_code = this.doc.language
						|| this.get_print_format().default_print_language
						|| frappe.boot.lang;
			
					//On selection of language retrieve language code
					const me = this;
					$(fields.language_sel.input).change(function(){
						me.lang_code = this.value
					})
			
					// Load all languages in the select field language_sel
					$(fields.language_sel.input)
						.empty()
						.add_options(frappe.get_languages());
			
					if (this.lang_code) {
						$(fields.language_sel.input).val(this.lang_code);
					}
				}
			
				setup_print() {
					// print formats
					const fields = this.dialog.fields_dict;
			
					// toggle print format
					$(fields.attach_document_print.input).click(function() {
						$(fields.select_print_format.wrapper).toggle($(this).prop("checked"));
					});
			
					// select print format
					$(fields.select_print_format.wrapper).toggle(false);
			
					if (this.frm) {
						const print_formats = frappe.meta.get_print_formats(this.frm.meta.name);
						$(fields.select_print_format.input)
							.empty()
							.add_options(print_formats)
							.val(print_formats[0]);
					} else {
						$(fields.attach_document_print.wrapper).toggle(false);
					}
			
				}
			
				setup_attach() {
					const fields = this.dialog.fields_dict;
					const attach = $(fields.select_attachments.wrapper);
			
					if (!this.attachments) {
						this.attachments = [];
					}
			
					let args = {
						folder: 'Home/Attachments',
						on_success: attachment => {
							this.attachments.push(attachment);
							this.render_attachment_rows(attachment);
						}
					};
			
					if (this.frm) {
						args = {
							doctype: this.frm.doctype,
							docname: this.frm.docname,
							folder: 'Home/Attachments',
							on_success: attachment => {
								this.frm.attachments.attachment_uploaded(attachment);
								this.render_attachment_rows(attachment);
							}
						};
					}
			
					$(`
						<label class="control-label">
							${__("Select Attachments")}
						</label>
						<div class='attach-list'></div>
						<p class='add-more-attachments'>
							<button class='btn btn-xs btn-default'>
								${frappe.utils.icon('small-add', 'xs')}&nbsp;
								${__("Add Attachment")}
							</button>
						</p>
					`).appendTo(attach.empty());
			
					attach
						.find(".add-more-attachments button")
						.on('click', () => new frappe.ui.FileUploader(args));
					this.render_attachment_rows();
				}
			
				render_attachment_rows(attachment) {
					const select_attachments = this.dialog.fields_dict.select_attachments;
					const attachment_rows = $(select_attachments.wrapper).find(".attach-list");
					if (attachment) {
						attachment_rows.append(this.get_attachment_row(attachment, true));
					} else {
						let files = [];
						if (this.attachments && this.attachments.length) {
							files = files.concat(this.attachments);
						}
						if (this.frm) {
							files = files.concat(this.frm.get_files());
						}
			
						if (files.length) {
							$.each(files, (i, f) => {
								if (!f.file_name) return;
								if (!attachment_rows.find(`[data-file-name="${f.name}"]`).length) {
									f.file_url = frappe.urllib.get_full_url(f.file_url);
									attachment_rows.append(this.get_attachment_row(f));
								}
							});
						}
					}
				}
			
				get_attachment_row(attachment, checked) {
					return $(`<p class="checkbox flex">
						<label class="ellipsis" title="${attachment.file_name}">
							<input
								type="checkbox"
								data-file-name="${attachment.name}"
								${checked ? 'checked': ''}>
							</input>
							<span class="ellipsis">${attachment.file_name}</span>
						</label>
						&nbsp;
						<a href="${attachment.file_url}" target="_blank" class="btn-linkF">
							${frappe.utils.icon('link-url')}
						</a>
					</p>`);
				}
			
				setup_email() {
					// email
					const fields = this.dialog.fields_dict;
			
					if (this.attach_document_print) {
						$(fields.attach_document_print.input).click();
						$(fields.select_print_format.wrapper).toggle(true);
					}
			
					$(fields.send_me_a_copy.input).on('click', () => {
						// update send me a copy (make it sticky)
						const val = fields.send_me_a_copy.get_value();
						frappe.db.set_value('User', frappe.session.user, 'send_me_a_copy', val);
						frappe.boot.user.send_me_a_copy = val;
					});
			
				}
			
				send_action() {
					const me = this;
					const btn = me.dialog.get_primary_btn();
					const form_values = this.get_values();
					if (!form_values) return;
			
					const selected_attachments =
						$.map($(me.dialog.wrapper).find("[data-file-name]:checked"), function (element) {
							return $(element).attr("data-file-name");
						});
			
			
					if (form_values.attach_document_print) {
						me.send_email(btn, form_values, selected_attachments, null, form_values.select_print_format || "");
					} else {
						me.send_email(btn, form_values, selected_attachments);
					}
				}
			
				get_values() {
					const form_values = this.dialog.get_values();
			
					// cc
					for (let i = 0, l = this.dialog.fields.length; i < l; i++) {
						const df = this.dialog.fields[i];
			
						if (df.is_cc_checkbox) {
							// concat in cc
							if (form_values[df.fieldname]) {
								form_values.cc = ( form_values.cc ? (form_values.cc + ", ") : "" ) + df.fieldname;
								form_values.bcc = ( form_values.bcc ? (form_values.bcc + ", ") : "" ) + df.fieldname;
							}
			
							delete form_values[df.fieldname];
						}
					}
			
					return form_values;
				}
			
				save_as_draft() {
					if (this.dialog && this.frm) {
						let message = this.dialog.get_value('content');
						message = message.split(separator_element)[0];
						localforage.setItem(this.frm.doctype + this.frm.docname, message).catch(e => {
							if (e) {
								// silently fail
								console.log(e); // eslint-disable-line
								console.warn('[Communication] IndexedDB is full. Cannot save message as draft'); // eslint-disable-line
							}
						});
			
					}
				}
			
				clear_cache() {
					this.delete_saved_draft();
					this.get_last_edited_communication(true);
				}
			
				delete_saved_draft() {
					if (this.dialog && this.frm) {
						localforage.removeItem(this.frm.doctype + this.frm.docname).catch(e => {
							if (e) {
								// silently fail
								console.log(e); // eslint-disable-line
								console.warn('[Communication] IndexedDB is full. Cannot save message as draft'); // eslint-disable-line
							}
						});
					}
				}
			
				send_email(btn, form_values, selected_attachments, print_html, print_format) {
					const me = this;
					this.dialog.hide();
			
					if (!form_values.recipients) {
						frappe.msgprint(__("Enter Email Recipient(s)"));
						return;
					}
			
					if (!form_values.attach_document_print) {
						print_html = null;
						print_format = null;
					}
			
			
					if (this.frm && !frappe.model.can_email(this.doc.doctype, this.frm)) {
						frappe.msgprint(__("You are not allowed to send emails related to this document"));
						return;
					}
			
			
					return frappe.call({
						method:"frappe.core.doctype.communication.email.make",
						args: {
							recipients: form_values.recipients,
							cc: form_values.cc,
							bcc: form_values.bcc,
							subject: form_values.subject,
							content: form_values.content,
							// doctype: me.doc.doctype,
							// name: me.doc.name,
							send_email: 1,
							print_html: print_html,
							send_me_a_copy: form_values.send_me_a_copy,
							print_format: print_format,
							sender: form_values.sender,
							sender_full_name: form_values.sender
								? frappe.user.full_name()
								: undefined,
							email_template: form_values.email_template,
							attachments: selected_attachments,
							_lang : me.lang_code,
							read_receipt:form_values.send_read_receipt,
							print_letterhead: me.is_print_letterhead_checked(),
						},
						btn,
						callback(r) {
							if (!r.exc) {
								frappe.utils.play_sound("email");
			
								if (r.message["emails_not_sent_to"]) {
									frappe.msgprint(__("Email not sent to {0} (unsubscribed / disabled)",
										[ frappe.utils.escape_html(r.message["emails_not_sent_to"]) ]) );
								}
			
								me.clear_cache();
			
								if (me.frm) {
									me.frm.reload_doc();
								}
			
								// try the success callback if it exists
								if (me.success) {
									try {
										me.success(r);
									} catch (e) {
										console.log(e); // eslint-disable-line
									}
								}
			
							} else {
								frappe.msgprint(__("There were errors while sending email. Please try again."));
			
								// try the error callback if it exists
								if (me.error) {
									try {
										me.error(r);
									} catch (e) {
										console.log(e); // eslint-disable-line
									}
								}
							}
						}
					});
				}
			
				is_print_letterhead_checked() {
					if (this.frm && $(this.frm.wrapper).find('.form-print-wrapper').is(':visible')){
						return $(this.frm.wrapper).find('.print-letterhead').prop('checked') ? 1 : 0;
					} else {
						return (frappe.model.get_doc(":Print Settings", "Print Settings") ||
							{ with_letterhead: 1 }).with_letterhead ? 1 : 0;
					}
				}
			
				async set_content(sender_email,opts) {
					let company = frappe.query_report.get_filter('company');
					let supplier = frappe.query_report.get_filter('supplier');
					if(frappe.query_report.get_filter_value('view_type') == 'Supplier View'){
						frappe.throw(__('This action is allowed only for the document view type'));
						return;
					}
				let selected_rows = [];
				let indexes = query_report.datatable.rowmanager.getCheckedRows();
				for (let row = 0; row < indexes.length; ++row) {
					if(query_report.data[indexes[row]]['match_status']!='Missing in 2B'){
					selected_rows.push({'gstr_2b':query_report.data[indexes[row]]['gstr_2b']});
				}
				}
					if($.isEmptyObject(selected_rows))
					{
						frappe.throw(__("Please select rows to update status. Also, make sure that you have not selected any row of match status Missing in 2B."));
						return
					}
						else{
							
					
					}
					if (this.content_set) return;
					console.log('message opts',sender_email)
					let message = sender_email;
					// if (!message && this.frm) {
					// 	const { doctype, docname } = this.frm;
					// 	message = await localforage.getItem(doctype + docname) || "";
					// 	console.log('message',message)
					// }
			
					if (message) {
						this.content_set = true;
					}
			
					message += await this.get_signature(sender_email || null);
			
					if (this.is_a_reply && !this.reply_set) {
						message += this.get_earlier_reply();
					}
			
					await this.dialog.set_value("content", message);
				}
			
				async get_signature(sender_email) {
					let signature = frappe.boot.user.email_signature;
			
					if (!signature) {
						let filters = {
							'add_signature': 1
						};
			
						if (sender_email) {
							filters['email_id'] = sender_email;
						} else {
							filters['default_outgoing'] = 1;
						}
			
						const email_accounts = await frappe.db.get_list("Email Account", {
							filters: filters,
							fields: ['signature', 'email_id'],
							limit: 1
						});
			
						let filtered_email = null;
						if (email_accounts.length) {
							signature = email_accounts[0].signature;
							filtered_email = email_accounts[0].email_id;
						}
			
						if (!sender_email && filtered_email) {
							if (this.user_email_accounts &&
								this.user_email_accounts.includes(filtered_email)) {
								this.dialog.set_value('sender', filtered_email);
							}
						}
					}
			
					if (!signature) return "";
			
					if (!frappe.utils.is_html(signature)) {
						signature = signature.replace(/\n/g, "<br>");
					}
			
					return "<br>" + signature;
				}
			
				get_earlier_reply() {
					this.reply_set = false;
			
					const last_email = (
						this.last_email
						|| this.frm && this.frm.timeline.get_last_email(true)
					);
			
					if (!last_email) return "";
					let last_email_content = last_email.original_comment || last_email.content;
			
					// convert the email context to text as we are enclosing
					// this inside <blockquote>
					last_email_content = this.html2text(last_email_content).replace(/\n/g, '<br>');
			
					// clip last email for a maximum of 20k characters
					// to prevent the email content from getting too large
					if (last_email_content.length > 20 * 1024) {
						last_email_content += '<div>' + __('Message clipped') + '</div>' + last_email_content;
						last_email_content = last_email_content.slice(0, 20 * 1024);
					}
			
					const communication_date = frappe.datetime.global_date_format(
						last_email.communication_date || last_email.creation
					);
			
					this.reply_set = true;
			
					return `
						<div><br></div>
						${separator_element || ''}
						<p>
						${__("On {0}, {1} wrote:", [communication_date, last_email.sender])}
						</p>
						<blockquote>
						${last_email_content}
						</blockquote>
					`;
				}
			
            
                html2text(html) {
                    // convert HTML to text and try and preserve whitespace
                    const d = document.createElement( 'div' );
                    d.innerHTML = html.replace(/<\/div>/g, '<br></div>')  // replace end of blocks
                        .replace(/<\/p>/g, '<br></p>') // replace end of paragraphs
                        .replace(/<br>/g, '\n');
            
                    // replace multiple empty lines with just one
                    return d.textContent.replace(/\n{3,}/g, '\n\n');
                }
        
		
		});
	
		

		// fetch Return Period
		frappe.call({
			method : 'reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.return_period_query',
			freeze : true,
			callback: function(r) {
				if(r.message) {
					let return_periods = r.message
					let options = []
					for(let option of return_periods){
						options.push({
							"value":option,
							"description":""
						})
					}
					var return_period = frappe.query_report.get_filter('return_period');
					return_period.df.options = options;
					return_period.refresh();
				}
			}
		});
	},
	"formatter": function(value, row, column, data, default_formatter) {
		if (column.fieldname=="supplier") {
			value = data.supplier;
	
			column.link_onclick =
				"frappe.query_reports['CR GSTR 2B vs PI GSTIN Matching Tool'].apply_filters(" + JSON.stringify(data) + ", 'supplier')";
		}
		if (column.fieldname=="gstin") {
			value = data.gstin;
	
			column.link_onclick =
				"frappe.query_reports['CR GSTR 2B vs PI GSTIN Matching Tool'].apply_filters(" + JSON.stringify(data) + ", 'gstin')";
		}
	
		value = default_formatter(value, row, column, data);
		return value;
	},
	"apply_filters": async function(data, filter_type) {
		var return_period = frappe.query_report.get_filter_value('return_period');
		const query_string = frappe.utils.get_query_string(frappe.get_route_str());
		const query_params = frappe.utils.get_query_params(query_string);
	if (!return_period && query_params.prepared_report_name){
			return_period = await get_return_period(query_params);
		}
		if (!data.supplier && !data.gstin) return;
		if (filter_type === 'gstin'){
			data.supplier = null;
		}
		else if(filter_type === 'supplier'){
			data.gstin = '';
		}
		await window.open(`#query-report/CR GSTR 2B vs PI GSTIN Matching Tool?view_type=Document View&
		supplier_gstin=${data.gstin}&
		supplier=${data.supplier}&
		company=${frappe.query_report.get_filter_value('company')}&
		gst_state=${frappe.query_report.get_filter_value('gst_state')}&
		company_gstin=${frappe.query_report.get_filter_value('company_gstin')}&
		based_on=${frappe.query_report.get_filter_value('based_on')}&
		from_date=${frappe.query_report.get_filter_value('from_date')}&
		to_date=${frappe.query_report.get_filter_value('to_date')}&
		return_period=${return_period}&
		transaction_type=${frappe.query_report.get_filter_value('transaction_type')}`)
	},
	after_datatable_render: table_instance => {
		let data = table_instance.datamanager.data;
		for (let row = 0; row < data.length; ++row) {
			table_instance.style.setStyle(`.dt-row-${row} .dt-cell`, {backgroundColor: 'rgba(255,255,255);'});
		}	
		for (let row = 0; row < data.length; ++row) {
			if(frappe.query_report.get_filter_value('view_type') == 'Document View'){
			if (data[row]['match_status'] == 'Exact Match') {
					table_instance.style.setStyle(`.dt-row-${row} .dt-cell`, {backgroundColor: 'rgba(135,206,250);'});
				}
			if (data[row]['status'] == 'Accepted') {
				table_instance.style.setStyle(`.dt-row-${row} .dt-cell`, {backgroundColor: 'rgba(37,220,2,0.2);'});
			}
		}
		if(frappe.query_report.get_filter_value('view_type') == 'Supplier View'){
			if (data[row]['total_pending_documents'] == 0 && data[row]['total_2b']!=0) {
				table_instance.style.setStyle(`.dt-row-${row} .dt-cell`, {backgroundColor: 'rgba(37,220,2,0.2);'});
			}
		}
		table_instance.style.setStyle(`.dt-scrollable`, {height: '600px;'});
	}
	}
}
	var render = function(render_details, dialog) {
		let gstr2b = render_details[0];
		let pr = render_details[1];
		let tax_details = render_details[2];
		let main_details = render_details[3];
		let other_details = render_details[4];
		let link_details = ``
		if (pr && gstr2b){
			link_details += `
			<div>
			<h3 style="text-align:left;float:left;">${gstr2b}</h3> 
			<h3 style="text-align:right;float:right;">${pr}</h3> 
			</div>
			`
		}
		if (pr && !gstr2b){
			link_details += `
			<div>
			<h3 style="text-align:left;float:left;">${pr}</h3> 
			</div>
			`
		}
		if (!pr && gstr2b){
			link_details += `
			<div>
			<h3 style="text-align:left;float:left;">${gstr2b}</h3> 
			</div>
			`
		}
		let tax_details_summary = () => {
			let summary = ``
			$.each(tax_details, function(i, d) {
				summary+=`
					<tr>
						<td>${i}</td>`
				for (let key in d) {
					summary+=`
						<td>${d[key]}</td>`
				}
				summary+=`</tr>`
			});
			return `
				<div>
				${link_details}
					<table class="table table-bordered">
						<tr>
							<th width="20%">${__('Data Source')}</th>
							<th width="10%">${__('Taxable Value')}</th>
							<th width="10%">${__('Tax Value')}</th>
							<th width="10%">${__('IGST')}</th>
							<th width="10%">${__('CGST')}</th>
							<th width="10%">${__('SGST')}</th>
							<th width="10%">${__('CESS')}</th>
						</tr>
						${summary}
					</table>
				</div>
			`;
		}
	
		let other_details_summary = () => {
			let summary = ``
			$.each(other_details, function(i, d) {
				summary+=`
					<tr>
						<td>${i}</td>`
				for (let key in d) {
					summary+=`
						<td>${d[key]}</td>`
				}
				summary+=`</tr>`
			});
			return `
				<div>
					<table class="table table-bordered">
						<tr>
							<th width="20%">${__('Data Source')}</th>
							<th width="10%">${__('Doc No')}</th>
							<th width="10%">${__('Date')}</th>
							<th width="10%">${__('POS')}</th>
							<th width="10%">${__('Reverse Charge')}</th>
							<th width="10%">${__('Return Period')}</th>
						</tr>
						${summary}
					</table>
				</div>
			`;
		}

		let main_details_summary = () => {
			let summary = ``
			$.each(main_details, function(i, d) {
				summary+=`
					<tr>
						<td>${i}</td>`
				for (let key in d) {
					summary+=`
						<td>${d[key]}</td>`
				}
				summary+=`</tr>`
			});
			return `
				<div>
					<table class="table table-bordered">
						<tr>
							<th width="20%">${__('Data Source')}</th>
							<th width="20%">${__('Supplier')}</th>
							<th width="20%">${__('GSTIN')}</th>
							<th width="10%">${__('Document Type')}</th>
							<th width="10%">${__('Match Status')}</th>
							<th width="10%">${__('Reason')}</th>
							<th width="10%">${__('Docstatus')}</th>
						</tr>
						${summary}
					</table>
				</div>
			`;
		}
		let html = `
			${tax_details_summary()}
			${main_details_summary()}
			${other_details_summary()}
		`;
	
		dialog.get_field('preview_html').html(html);
	}
	var render_link_view = function(render_details, dialog) {
		let gstr2b = render_details[0];
		let tax_details = render_details[1];
		let main_details = render_details[2];
		let other_details = render_details[3];
		let pr_details = render_details[4];
		let link_details = `
			<div>
			<h3 style="text-align:left;float:left;">${gstr2b}</h3> 
			</div>
			`
		let pr_header = `
		<div>
		<h3 style="text-align:left;float:left;">Suggested PI Details</h3> 
		</div>
		`
		let tax_details_summary = () => {
			let summary = ``
			$.each(tax_details, function(i, d) {
				for (let key in d) {
					summary+=`
						<td>${d[key]}</td>`
				}
				summary+=`</tr>`
			});
			return `
				<div>
				${link_details}
					<table class="table table-bordered">
						<tr>
							<th width="10%">${__('Taxable Value')}</th>
							<th width="10%">${__('Tax Value')}</th>
							<th width="10%">${__('IGST')}</th>
							<th width="10%">${__('CGST')}</th>
							<th width="10%">${__('SGST')}</th>
							<th width="10%">${__('CESS')}</th>
						</tr>
						${summary}
					</table>
				</div>
			`;
		}
	
		let other_details_summary = () => {
			let summary = ``
			$.each(other_details, function(i, d) {
				for (let key in d) {
					summary+=`
						<td>${d[key]}</td>`
				}
				summary+=`</tr>`
			});
			return `
				<div>
					<table class="table table-bordered">
						<tr>
							<th width="10%">${__('Doc No')}</th>
							<th width="10%">${__('Date')}</th>
							<th width="10%">${__('POS')}</th>
							<th width="10%">${__('Reverse Charge')}</th>
							<th width="10%">${__('Return Period')}</th>
						</tr>
						${summary}
					</table>
				</div>
			`;
		}

		let main_details_summary = () => {
			let summary = ``
			$.each(main_details, function(i, d) {
				for (let key in d) {
					summary+=`
						<td>${d[key]}</td>`
				}
				summary+=`</tr>`
			});
			return `
				<div>
					<table class="table table-bordered">
						<tr>
							<th width="20%">${__('Supplier')}</th>
							<th width="20%">${__('GSTIN')}</th>
							<th width="10%">${__('Document Type')}</th>
							<th width="10%">${__('Match Status')}</th>
							<th width="10%">${__('Docstatus')}</th>
						</tr>
						${summary}
					</table>
				</div>
			`;
		}
		let pr_details_summary = () => {
			let summary = ``
			$.each(pr_details, function(i, d) {
				for (let key in d) {
					summary+=`
						<td>${d[key]}</td>`
				}
				summary+=`</tr>`
			});
			return `
				<div>
				${pr_header}
					<table class="table table-bordered">
						<tr>
							<th width="20%">${__('PI')}</th>
							<th width="20%">${__('Doc No')}</th>
							<th width="10%">${__('Date')}</th>
							<th width="10%">${__('Tax Value')}</th>
							<th width="10%">${__('Taxable Value')}</th>
						</tr>
						${summary}
					</table>
				</div>
			`;
		}
		let html = `
			${tax_details_summary()}
			${main_details_summary()}
			${other_details_summary()}
			${pr_details_summary()}
		`;
		dialog.get_field('preview_html').html(html);
	}
	var render_summary= function(gstr2b, purchase_inv) {
		var dialog = new frappe.ui.Dialog({
			title: __("Selection Summary"),
			fields: [
				{
					"label": "Preview",
					"fieldname": "preview_html",
					"fieldtype": "HTML"
				}
			]
		});
		frappe.call('reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.get_selection_details', {
			gstr2b: gstr2b,
			purchase_inv: purchase_inv,
			show_tax: 1,
			freeze: true
		}).then(r => {
			this.render(r.message, dialog);
		});
		dialog.get_field('preview_html').html('Loading...');
		dialog.show();
		dialog.$wrapper.find('.modal-dialog').css("width", "80%");
		dialog.$wrapper.find('.modal-dialog').css("max-width", "80%");
		dialog.$wrapper.find('.modal-dialog').css("width", "80%");
	}
	
	var update_status= function(gstr2b, purchase_inv) {
		var dialog = new frappe.ui.Dialog({
			title: __("Selection Summary"),
			fields: [
				{
					"label": "Preview",
					"fieldname": "preview_html",
					"fieldtype": "HTML"
				},
				{
					"label": "Action",
					"fieldname": "action",
					"fieldtype": "Select",
					"reqd": 1,
					"options": ["Pending", "Accepted"]
				}
			],
			primary_action: function() {
				frappe.call('reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.update_status', {
					data: [{'gstr_2b': gstr2b}],
					status: dialog.fields_dict.action.value
				}).then(r => {
					frappe.msgprint(__("Status Updated"));
				});
				dialog.hide();
			},
			primary_action_label: __('Update'),
		});
		frappe.call('reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.get_selection_details', {
			gstr2b: gstr2b,
			purchase_inv: purchase_inv,
			show_tax: 1,
			freeze: true
		}).then(r => {
			this.render(r.message, dialog);
		});
		dialog.get_field('preview_html').html('Loading...');
		dialog.show();
		dialog.$wrapper.find('.modal-dialog').css("width", "80%");
		dialog.$wrapper.find('.modal-dialog').css("max-width", "80%");
		dialog.$wrapper.find('.modal-dialog').css("width", "80%");
	}
	
	var create_purchase_inv= function(gstr2b, purchase_inv) {
		var dialog = new frappe.ui.Dialog({
			title: __("Selection Summary"),
			fields: [
				{
					"label": "Preview",
					"fieldname": "preview_html",
					"fieldtype": "HTML"
				}
			],
			primary_action: function() {
				frappe.call({
					method: "frappe.client.get",
					freeze: true,
					freeze_message: __("Processing..."),
					args: {
						doctype: "CD GSTR 2B Entry",
						name: gstr2b,
					},
					callback(r) {
						if(r.message) {
							var gstr2b_doc = r.message;
							if (gstr2b_doc.cf_transaction_type == 'CDN'){
								frappe.throw(__('Unable to create invoice for transaction type CDN'));
								return;
							}
							else{
								frappe.new_doc("Purchase Invoice",{"company": gstr2b_doc.cf_company,
									"bill_no" : gstr2b_doc.cf_document_number,
									"supplier" : gstr2b_doc.cf_party,
									"bill_date" : gstr2b_doc.cf_document_date,
									"reverse_charge" : gstr2b_doc.cf_reverse_charge, 
									"gst_category" : gstr2b_doc.cf_invoice_type,
									"place_of_supply" : gstr2b_doc.cf_place_of_supply,
									"grand_total" : gstr2b_doc.cf_total_amount,
									"taxes_and_charges_added" : gstr2b_doc.cf_tax_amount,
									"total" : gstr2b_doc.cf_taxable_amount,
									"supplier_gstin" : gstr2b_doc.cf_party_gstin,
									"company_gstin" :gstr2b_doc.cf_company_gstin});
							}
						}
					}
				});
				dialog.hide();
			},
			primary_action_label: __('Create')
		});
		frappe.call('reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.get_selection_details', {
			gstr2b: gstr2b,
			purchase_inv: purchase_inv,
			show_tax: 1,
			freeze: true
		}).then(r => {
			this.render(r.message, dialog);
		});
		dialog.get_field('preview_html').html('Loading...');
		dialog.show();
		dialog.$wrapper.find('.modal-dialog').css("width", "80%");
		dialog.$wrapper.find('.modal-dialog').css("max-width", "80%");
		dialog.$wrapper.find('.modal-dialog').css("width", "80%");
	}	

	var unlink_pr = function(gstr2b, status) {
			if (status == 'Accepted'){
			frappe.confirm(__('This action will overwrite the status. Are you sure you want to unlink this accepted document?'),
			function() {
				frappe.call({
					method: "reconciler.reconciler.doctype.cd_gstr_2b_entry.cd_gstr_2b_entry.unlink_pr",
					freeze: true,
					freeze_message: __("Processing..."),
					args: {doc_name:gstr2b},
					callback: function(r) {
						frappe.msgprint(__("PI Unlinked successfully"))
					}
				})
			}
		);
			}
		else{
			frappe.call({
				method: "reconciler.reconciler.doctype.cd_gstr_2b_entry.cd_gstr_2b_entry.unlink_pr",
				freeze: true,
				freeze_message: __("Processing..."),
				args: {doc_name:gstr2b},
				callback: function(r) {
					frappe.msgprint(__("PI Unlinked successfully"))
				}
			})
	}
}
var get_unlinked_pr_list = function(gstr2b, from_date, to_date) {
	let pr_list = [];
	frappe.call('reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.get_suggested_pr_list', {
		gstr2b: gstr2b,
		from_date: from_date,
		to_date: to_date
	}).then(r => {
		if(!$.isEmptyObject(r.message)){
			var dialog = new frappe.ui.Dialog({
				fields: [
					{
						"label": "Preview",
						"fieldname": "preview_html",
						"fieldtype": "HTML"
					},
					{
						label: __('Purchase Invoice'),
						fieldname: 'purchase_invoice',
						fieldtype: 'Link',
						reqd: 1,
						options: 'Purchase Invoice',
						get_query: function() {
							return {
								query: "reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.get_unlinked_pr_list",
								filters: {
									'gstr2b': gstr2b,
									'from_date': from_date,
									'to_date': to_date
								}
							};
						}
					}
				],
				primary_action: function() {
					frappe.call('reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.link_pr', {
						gstr2b: gstr2b,
						pr: dialog.fields_dict.purchase_invoice.value,
						freeze: true
					}).then(r => {
						frappe.msgprint(__("Linked Successfully"));
					});
					dialog.hide();
				},
				primary_action_label: __('Link'),
			});
			frappe.call('reconciler.reconciler.report.cr_gstr_2b_vs_pi_gstin_matching_tool.cr_gstr_2b_vs_pi_gstin_matching_tool.get_link_view_details', {
				gstr2b: gstr2b,
				pr_list: r.message,
				freeze: true
			}).then(r => {
				this.render_link_view(r.message, dialog);
			});
			dialog.get_field('preview_html').html('Loading...');
			dialog.show();
			dialog.$wrapper.find('.modal-dialog').css("width", "80%");
			dialog.$wrapper.find('.modal-dialog').css("max-width", "80%");
			dialog.$wrapper.find('.modal-dialog').css("width", "80%");
			}
		else{
			frappe.throw(__("No PI found"));
			return
		}
	})};
	var get_return_period = function(query_params) {
		frappe.db.get_value("Prepared Report", query_params.prepared_report_name, "filters", (r) => {
			if (r && r.filters)
			{
				return JSON.parse(r.filters)["return_period"];
			}
		})
	}